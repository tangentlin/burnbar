import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ARCHIVE_SCHEMA_VERSION, ArchiveStore, atomicWriteJson } from "../src/store.js";
import { daily, model, session } from "./helpers.js";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "burnbar-store-"));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe("ArchiveStore.mergeDaily — dirty check", () => {
  it("seeds, skips an identical re-capture, and persists growth", async () => {
    const store = new ArchiveStore(dir);
    const seed = await store.mergeDaily(
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 100, cost: 1 })]),
    );
    expect(seed.changed).toBe(true);

    const identical = await store.mergeDaily(
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 100, cost: 1 })], {
        capturedAt: "2026-06-29T00:00:00.000Z",
      }),
    );
    expect(identical.changed).toBe(false);

    const grown = await store.mergeDaily(
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 500, cost: 3 })]),
    );
    expect(grown.changed).toBe(true);
    expect((await store.readDaily("2026-06-28"))?.totals.totalTokens).toBe(500);
  });

  it("readAllDaily returns records sorted by date", async () => {
    const store = new ArchiveStore(dir);
    await store.mergeDaily(daily("2026-06-28", [model({ modelName: "m", inputTokens: 1 })]));
    await store.mergeDaily(daily("2026-06-26", [model({ modelName: "m", inputTokens: 1 })]));
    await store.mergeDaily(daily("2026-06-27", [model({ modelName: "m", inputTokens: 1 })]));
    expect((await store.readAllDaily()).map((r) => r.date)).toEqual([
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
    ]);
  });
});

describe("ArchiveStore — backfill semantics", () => {
  it("a full-range capture seeds everything and re-running is idempotent", async () => {
    const store = new ArchiveStore(dir);
    const batch = [
      daily("2026-06-26", [model({ modelName: "m", inputTokens: 10, cost: 1 })]),
      daily("2026-06-27", [model({ modelName: "m", inputTokens: 20, cost: 2 })]),
      daily("2026-06-28", [model({ modelName: "m", inputTokens: 30, cost: 3 })]),
    ];

    let changed = 0;
    for (const record of batch) {
      if ((await store.mergeDaily(record)).changed) changed++;
    }
    expect(changed).toBe(3);

    changed = 0;
    for (const record of batch) {
      if ((await store.mergeDaily(record)).changed) changed++;
    }
    expect(changed).toBe(0);
  });
});

describe("ArchiveStore.mergeSessions — sharding", () => {
  it("counts only changed sessions and is idempotent", async () => {
    const store = new ArchiveStore(dir);
    const sessions = [
      session("s1", [model({ modelName: "m", inputTokens: 100, cost: 1 })], {
        lastActivity: "2026-06-28T20:00:00.000Z",
      }),
      session("s2", [model({ modelName: "m", inputTokens: 50, cost: 0.5 })], {
        agent: "codex",
        lastActivity: "2026-06-28T03:30:00.000Z",
      }),
    ];
    expect(await store.mergeSessions(sessions)).toBe(2);
    expect(await store.mergeSessions(sessions)).toBe(0);
  });

  it("moves a session across shards when its month rolls over, without duplicating it", async () => {
    const store = new ArchiveStore(dir);
    await store.mergeSessions([
      session("s1", [model({ modelName: "m", inputTokens: 10, cost: 1 })], {
        lastActivity: "2026-05-31T23:00:00.000Z",
      }),
    ]);
    expect(await fsp.readdir(path.join(dir, "sessions"))).toContain("2026-05.json");

    await store.mergeSessions([
      session("s1", [model({ modelName: "m", inputTokens: 50, cost: 2 })], {
        lastActivity: "2026-06-01T05:00:00.000Z",
      }),
    ]);

    const survivors = (await store.readAllSessions()).filter((s) => s.sessionId === "s1");
    expect(survivors).toHaveLength(1);
    expect(survivors[0].totals.totalTokens).toBe(50);

    const may = JSON.parse(
      await fsp.readFile(path.join(dir, "sessions", "2026-05.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(may.s1).toBeUndefined();
  });
});

describe("atomicWriteJson", () => {
  it("writes complete JSON and leaves no temp file behind", async () => {
    const file = path.join(dir, "ok.json");
    await atomicWriteJson(file, { a: 1, b: [2, 3] });
    expect(JSON.parse(await fsp.readFile(file, "utf8"))).toEqual({ a: 1, b: [2, 3] });
    expect((await fsp.readdir(dir)).filter((e) => e.includes(".tmp"))).toHaveLength(0);
  });

  it("a failed rename leaves the destination's prior content intact and cleans the temp", async () => {
    const file = path.join(dir, "guarded.json");
    await atomicWriteJson(file, { version: 1 });

    const rename = vi.fn().mockRejectedValue(new Error("rename boom"));
    await expect(
      atomicWriteJson(file, { version: 2 }, { mkdir: fsp.mkdir, writeFile: fsp.writeFile, rename }),
    ).rejects.toThrow("rename boom");

    expect(JSON.parse(await fsp.readFile(file, "utf8"))).toEqual({ version: 1 });
    expect((await fsp.readdir(dir)).filter((e) => e.includes(".tmp"))).toHaveLength(0);
  });
});

describe("ArchiveStore.updateManifest", () => {
  it("sets firstCaptureAt once and advances lastCaptureAt", async () => {
    const store = new ArchiveStore(dir);
    await store.updateManifest({
      timezone: "UTC",
      ccusageVersion: "20.0.14",
      capturedAt: "2026-06-28T10:00:00.000Z",
    });
    await store.updateManifest({
      timezone: "UTC",
      ccusageVersion: "20.0.14",
      capturedAt: "2026-06-29T11:00:00.000Z",
    });
    const manifest = await store.readManifest();
    expect(manifest?.firstCaptureAt).toBe("2026-06-28T10:00:00.000Z");
    expect(manifest?.lastCaptureAt).toBe("2026-06-29T11:00:00.000Z");
    expect(manifest?.schemaVersion).toBe(ARCHIVE_SCHEMA_VERSION);
  });
});
