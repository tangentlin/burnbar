import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureService } from "../src/capture-service.js";
import { ArchiveStore } from "../src/store.js";
import type { UsageData } from "../src/types.js";
import dailyFixture from "./fixtures/daily.json";
import sessionFixture from "./fixtures/session.json";

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

const sessionCallCount = (runner: ReturnType<typeof fixtureRunner>) =>
  runner.mock.calls.filter(([args]) => args[0] === "session").length;

describe("CaptureService.start — first-run backfill", () => {
  it("seeds daily, sessions, manifest, and pushes tray usage", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    let usage: UsageData | undefined;
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      intervalMs: 10_000_000,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });
    service.onUsage((next) => {
      usage = next;
    });

    await service.start();

    expect((await store.readAllDaily()).map((r) => r.date)).toEqual(["2026-06-27", "2026-06-28"]);
    expect(await store.readAllSessions()).toHaveLength(2);
    expect(await store.readManifest()).not.toBeUndefined();
    expect(usage?.total?.totalTokens).toBe(20000);
    expect(usage?.daily?.cost).toBe(3.25);
  });
});

describe("CaptureService — dirty cache", () => {
  it("skips the store on an unchanged day instead of re-reading and re-merging", async () => {
    const store = new ArchiveStore(dir);
    const runner = fixtureRunner();
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      intervalMs: 10_000_000,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });
    await service.start();

    const mergeSpy = vi.spyOn(store, "mergeDaily");
    // Same day, identical ccusage output → the in-memory cache short-circuits.
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
      intervalMs: 10_000_000,
      now: () => clock,
    });

    await service.start();
    expect(sessionCallCount(runner)).toBe(1);

    clock = new Date("2026-06-29T00:05:00.000Z");
    await (service as unknown as { tick: () => Promise<void> }).tick();
    expect(sessionCallCount(runner)).toBe(2);
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
      intervalMs: 10_000_000,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });

    await service.flush();
    expect(await store.readAllDaily()).toHaveLength(2);
    expect(await store.readAllSessions()).toHaveLength(2);

    const callsAfterFirst = runner.mock.calls.length;
    await service.flush(); // guarded — must be a no-op
    expect(runner.mock.calls.length).toBe(callsAfterFirst);
  });
});

describe("CaptureService — best-effort on ccusage failure", () => {
  it("surfaces an error to the tray, never throws, and leaves the daily archive untouched", async () => {
    const store = new ArchiveStore(dir);
    const runner = vi.fn(async (args: string[]) => {
      if (args[0] === "daily") throw new Error("ccusage boom");
      return JSON.stringify(sessionFixture);
    });
    let usage: UsageData | undefined;
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      intervalMs: 10_000_000,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });
    service.onUsage((next) => {
      usage = next;
    });

    await expect(service.start()).resolves.toBeUndefined();
    expect(usage?.error).toBeDefined();
    expect(usage?.daily).toBeNull();
    expect(service.getUsage().error).toBeDefined();
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
    const runner = fixtureRunner();
    let usage: UsageData | undefined;
    service = new CaptureService({
      store,
      runner,
      timezone: "UTC",
      intervalMs: 10_000_000,
      now: () => new Date("2026-06-28T12:00:00.000Z"),
    });
    service.onUsage((next) => {
      usage = next;
    });

    await service.start();

    expect(await store.readAllDaily()).toHaveLength(0);
    expect(await store.readAllSessions()).toHaveLength(0);
    expect(usage?.total?.totalTokens).toBe(20000);
  });
});
