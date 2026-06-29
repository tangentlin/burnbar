import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureService } from "../src/capture-service.js";
import { ArchiveStore } from "../src/store.js";
import type { TrayState } from "../src/types.js";
import dailyFixture from "./fixtures/daily.json";
import sessionFixture from "./fixtures/session.json";

const FIXED_NOW = () => new Date("2026-06-28T12:00:00.000Z");

let dir: string;
let service: CaptureService | null = null;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "burnbar-svc-"));
});

afterEach(async () => {
  service?.dispose();
  service = null;
  await fsp.rm(dir, { recursive: true, force: true });
});

function fixtureRunner() {
  return vi.fn(async (args: string[]) => {
    if (args[0] === "daily") return JSON.stringify(dailyFixture);
    if (args[0] === "session") return JSON.stringify(sessionFixture);
    throw new Error(`unexpected ccusage args: ${args.join(" ")}`);
  });
}

const callCount = (runner: ReturnType<typeof fixtureRunner>, kind: string) =>
  runner.mock.calls.filter(([args]) => args[0] === kind).length;

describe("CaptureService.start — first-run backfill", () => {
  it("seeds the archive and pushes tray state (usage, lastUpdatedAt, sparkline, interval)", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    let state: TrayState | undefined;
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    service.onState((next) => {
      state = next;
    });

    await service.start();

    expect((await store.readAllDaily()).map((r) => r.date)).toEqual(["2026-06-27", "2026-06-28"]);
    expect(await store.readAllSessions()).toHaveLength(2);
    expect(await store.readManifest()).not.toBeUndefined();

    expect(state?.usage.daily?.cost).toBe(3.25);
    expect(state?.usage.total?.totalTokens).toBe(20000);
    expect(state?.lastUpdatedAt).toBe("2026-06-28T12:00:00.000Z");
    expect(state?.refreshIntervalMinutes).toBe(0);
    expect(state?.sparkline).toHaveLength(30);
    expect(state?.sparkline.at(-1)).toBe(3.25); // today's total spend
    expect(state?.sparkline.reduce((a, b) => a + b, 0)).toBeCloseTo(4.75, 10);
  });
});

describe("CaptureService — dirty cache", () => {
  it("skips the store on an unchanged day", async () => {
    const store = new ArchiveStore(dir);
    service = new CaptureService({
      store,
      runner: fixtureRunner(),
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    await service.start();

    const mergeSpy = vi.spyOn(store, "mergeDaily");
    await (service as unknown as { tick: () => Promise<void> }).tick();
    expect(mergeSpy).not.toHaveBeenCalled();
  });
});

describe("CaptureService — day rollover", () => {
  it("captures sessions again when the local day rolls over", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    let clock = new Date("2026-06-28T12:00:00.000Z");
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: () => clock,
    });

    await service.start();
    expect(callCount(runner, "session")).toBe(1);

    clock = new Date("2026-06-29T00:05:00.000Z");
    await (service as unknown as { tick: () => Promise<void> }).tick();
    expect(callCount(runner, "session")).toBe(2);
  });
});

describe("CaptureService.refreshNow", () => {
  it("forces an immediate daily + session capture", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    await service.start();
    const dailyBefore = callCount(runner, "daily");
    const sessionBefore = callCount(runner, "session");

    await service.refreshNow();

    expect(callCount(runner, "daily")).toBe(dailyBefore + 1);
    expect(callCount(runner, "session")).toBe(sessionBefore + 1);
  });
});

describe("CaptureService — auto-refresh interval", () => {
  it("ticks on the interval and stops in manual mode (0)", async () => {
    vi.useFakeTimers();
    try {
      const store = new ArchiveStore(dir);
      const runner = fixtureRunner();
      service = new CaptureService({
        store,
        runner,
        timezone: "UTC",
        refreshIntervalMinutes: 1,
        now: FIXED_NOW,
      });
      await service.start();
      const afterStart = callCount(runner, "daily");

      await vi.advanceTimersByTimeAsync(60_000);
      expect(callCount(runner, "daily")).toBe(afterStart + 1);

      service.setRefreshIntervalMinutes(0); // manual → timer cleared
      expect(service.getRefreshIntervalMinutes()).toBe(0);
      await vi.advanceTimersByTimeAsync(300_000);
      expect(callCount(runner, "daily")).toBe(afterStart + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-pushes state with the new interval when changed", async () => {
    const store = new ArchiveStore(dir);
    const states: TrayState[] = [];
    service = new CaptureService({
      store,
      runner: fixtureRunner(),
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    service.onState((next) => states.push(next));
    await service.start();

    service.setRefreshIntervalMinutes(30);
    expect(states.at(-1)?.refreshIntervalMinutes).toBe(30);
  });
});

describe("CaptureService — best-effort on ccusage failure", () => {
  it("surfaces an error, never throws, keeps lastUpdatedAt null, leaves the daily archive untouched", async () => {
    const store = new ArchiveStore(dir);
    const runner = vi.fn(async (args: string[]) => {
      if (args[0] === "daily") throw new Error("ccusage boom");
      return JSON.stringify(sessionFixture);
    });
    let state: TrayState | undefined;
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    service.onState((next) => {
      state = next;
    });

    await expect(service.start()).resolves.toBeUndefined();
    expect(state?.usage.error).toBeDefined();
    expect(state?.usage.daily).toBeNull();
    expect(state?.lastUpdatedAt).toBeNull();
    expect(await store.readAllDaily()).toHaveLength(0);
  });
});

describe("CaptureService — schema guard", () => {
  it("disables archive writes when the stored schema is newer, but keeps the tray working", async () => {
    await fsp.writeFile(
      path.join(dir, "manifest.json"),
      JSON.stringify({
        schemaVersion: 999,
        timezone: "UTC",
        ccusageVersion: "future",
        firstCaptureAt: "2030-01-01T00:00:00.000Z",
        lastCaptureAt: "2030-01-01T00:00:00.000Z",
      }),
      "utf8",
    );
    const store = new ArchiveStore(dir);
    let state: TrayState | undefined;
    service = new CaptureService({
      store,
      runner: fixtureRunner(),
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });
    service.onState((next) => {
      state = next;
    });

    await service.start();

    expect(await store.readAllDaily()).toHaveLength(0);
    expect(await store.readAllSessions()).toHaveLength(0);
    expect(state?.usage.total?.totalTokens).toBe(20000);
  });
});

describe("CaptureService.flush — before-quit", () => {
  it("persists the last interval's daily + sessions and is idempotent", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      refreshIntervalMinutes: 0,
      now: FIXED_NOW,
    });

    await service.flush();
    expect(await store.readAllDaily()).toHaveLength(2);
    expect(await store.readAllSessions()).toHaveLength(2);

    const callsAfterFirst = runner.mock.calls.length;
    await service.flush(); // guarded — no-op
    expect(runner.mock.calls.length).toBe(callsAfterFirst);
  });
});
