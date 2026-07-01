import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdaterLike } from "../src/update-service.js";
import { UpdateService } from "../src/update-service.js";
import type { UpdateState } from "../src/types.js";

let service: UpdateService | null = null;

afterEach(() => {
  service?.dispose();
  service = null;
});

/**
 * A fake UpdaterLike that captures registered listeners so tests can invoke
 * them directly to simulate electron-updater firing its events — mirrors
 * capture-service.test.ts's fixtureRunner mocking style.
 */
function fakeUpdater() {
  const listeners = new Map<string, (...args: never[]) => void>();
  const updater: UpdaterLike & { emit: (event: string, ...args: unknown[]) => void } = {
    autoDownload: true, // constructor must force this to false
    checkForUpdates: vi.fn(async () => null),
    downloadUpdate: vi.fn(async () => null),
    quitAndInstall: vi.fn(),
    on: vi.fn((event: string, listener: (...args: never[]) => void) => {
      listeners.set(event, listener);
    }),
    off: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    emit: (event, ...args) => {
      listeners.get(event)?.(...(args as never[]));
    },
  };
  return updater;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("UpdateService — construction", () => {
  it("forces autoDownload to false regardless of the injected updater's default", () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });
    expect(updater.autoDownload).toBe(false);
  });
});

describe("UpdateService.checkNow", () => {
  it("moves idle -> checking -> available on a simulated update-available event", async () => {
    const updater = fakeUpdater();
    const states: UpdateState[] = [];
    service = new UpdateService({ updater, isPackaged: () => true });
    service.onState((state) => states.push(state));

    const checkPromise = service.checkNow();
    updater.emit("checking-for-update");
    updater.emit("update-available", { version: "1.2.3" });
    await checkPromise;

    expect(states.map((s) => s.status)).toEqual(["checking", "available"]);
    expect(states.at(-1)?.version).toBe("1.2.3");
    expect(service.getState().status).toBe("available");
  });

  it("does not call the injected updater when the app is not packaged (dev guard)", async () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => false });

    await service.checkNow();

    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("lands in an error state without throwing when checkForUpdates() rejects", async () => {
    const updater = fakeUpdater();
    updater.checkForUpdates = vi.fn(async () => {
      throw new Error("network down");
    });
    const states: UpdateState[] = [];
    service = new UpdateService({ updater, isPackaged: () => true });
    service.onState((state) => states.push(state));

    await expect(service.checkNow()).resolves.toBeUndefined();

    expect(states.at(-1)?.status).toBe("error");
    expect(states.at(-1)?.error).toBe("network down");
  });

  it("lands in an error state without throwing when the updater emits an error event", () => {
    const updater = fakeUpdater();
    const states: UpdateState[] = [];
    service = new UpdateService({ updater, isPackaged: () => true });
    service.onState((state) => states.push(state));

    expect(() => updater.emit("error", new Error("signature invalid"))).not.toThrow();

    expect(states.at(-1)?.status).toBe("error");
    expect(states.at(-1)?.error).toBe("signature invalid");
  });
});

describe("UpdateService.downloadUpdate", () => {
  it("only proceeds when state is 'available'", async () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });

    // idle → defensive no-op
    await service.downloadUpdate();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();

    updater.emit("update-available", { version: "2.0.0" });
    await service.downloadUpdate();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
  });

  it("download-progress updates percent while preserving the known version", () => {
    const updater = fakeUpdater();
    const states: UpdateState[] = [];
    service = new UpdateService({ updater, isPackaged: () => true });
    service.onState((state) => states.push(state));

    updater.emit("update-available", { version: "2.0.0" });
    updater.emit("download-progress", { percent: 42.7 });

    const last = states.at(-1);
    expect(last?.status).toBe("downloading");
    expect(last?.percent).toBeCloseTo(42.7);
    expect(last?.version).toBe("2.0.0");
  });

  it("update-downloaded moves to the downloaded state", () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });

    updater.emit("update-available", { version: "2.0.0" });
    updater.emit("download-progress", { percent: 99 });
    updater.emit("update-downloaded", { version: "2.0.0" });

    expect(service.getState()).toMatchObject({ status: "downloaded", version: "2.0.0" });
  });

  it("a rejected downloadUpdate() promise lands in an error state without throwing", async () => {
    const updater = fakeUpdater();
    updater.downloadUpdate = vi.fn(async () => {
      throw new Error("disk full");
    });
    const states: UpdateState[] = [];
    service = new UpdateService({ updater, isPackaged: () => true });
    service.onState((state) => states.push(state));

    updater.emit("update-available", { version: "2.0.0" });
    await expect(service.downloadUpdate()).resolves.toBeUndefined();

    expect(states.at(-1)?.status).toBe("error");
    expect(states.at(-1)?.error).toBe("disk full");
  });
});

describe("UpdateService.quitAndInstall", () => {
  it("is a no-op unless status is 'downloaded'", () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });

    service.quitAndInstall();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();

    updater.emit("update-available", { version: "3.0.0" });
    service.quitAndInstall();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("calls the injected updater's quitAndInstall once downloaded", () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });

    updater.emit("update-available", { version: "3.0.0" });
    updater.emit("update-downloaded", { version: "3.0.0" });
    service.quitAndInstall();

    expect(updater.quitAndInstall).toHaveBeenCalledTimes(1);
  });
});

describe("UpdateService.start — cadence", () => {
  it("checks once immediately, then again after the fixed interval", async () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true, intervalMinutes: 60 });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});

describe("UpdateService.dispose", () => {
  it("clears the timer so no further checks fire", async () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true, intervalMinutes: 60 });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterStart = (updater.checkForUpdates as ReturnType<typeof vi.fn>).mock.calls.length;

    service.dispose();
    await vi.advanceTimersByTimeAsync(120 * 60_000);

    expect(updater.checkForUpdates).toHaveBeenCalledTimes(callsAfterStart);
  });

  it("removes all listeners it registered, so a shared updater doesn't accumulate them across instances", () => {
    const updater = fakeUpdater();
    service = new UpdateService({ updater, isPackaged: () => true });

    const registeredEvents = (updater.on as ReturnType<typeof vi.fn>).mock.calls.map(
      ([event]: [string]) => event,
    );
    expect(registeredEvents.length).toBeGreaterThan(0);

    service.dispose();

    const removedEvents = (updater.off as ReturnType<typeof vi.fn>).mock.calls.map(
      ([event]: [string]) => event,
    );
    expect(removedEvents.sort()).toEqual([...registeredEvents].sort());

    // A stray event after dispose must not trigger any state update.
    const states: UpdateState[] = [];
    service.onState((state) => states.push(state));
    updater.emit("error", new Error("post-dispose"));
    expect(states).toHaveLength(0);
  });
});
