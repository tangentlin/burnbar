import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_REFRESH_INTERVAL_MINUTES, SettingsStore } from "../src/settings.js";

let dir: string;

beforeEach(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "burnbar-settings-"));
});

afterEach(async () => {
  await fsp.rm(dir, { recursive: true, force: true });
});

describe("SettingsStore", () => {
  it("defaults to 15 minutes when no file exists", async () => {
    const settings = new SettingsStore(path.join(dir, "settings.json"));
    expect((await settings.load()).refreshIntervalMinutes).toBe(DEFAULT_REFRESH_INTERVAL_MINUTES);
  });

  it("persists a chosen interval and reloads it", async () => {
    const file = path.join(dir, "settings.json");
    const first = new SettingsStore(file);
    await first.load();
    await first.setRefreshIntervalMinutes(30);

    const second = new SettingsStore(file);
    expect((await second.load()).refreshIntervalMinutes).toBe(30);
  });

  it("keeps 0 (manual) as a valid value", async () => {
    const settings = new SettingsStore(path.join(dir, "settings.json"));
    await settings.load();
    expect((await settings.setRefreshIntervalMinutes(0)).refreshIntervalMinutes).toBe(0);
  });

  it("falls back to the default for a bogus stored value", async () => {
    const file = path.join(dir, "settings.json");
    await fsp.writeFile(file, JSON.stringify({ refreshIntervalMinutes: -5 }), "utf8");
    const settings = new SettingsStore(file);
    expect((await settings.load()).refreshIntervalMinutes).toBe(DEFAULT_REFRESH_INTERVAL_MINUTES);
  });

  it("honors a non-preset custom value", async () => {
    const file = path.join(dir, "settings.json");
    await fsp.writeFile(file, JSON.stringify({ refreshIntervalMinutes: 7 }), "utf8");
    const settings = new SettingsStore(file);
    expect((await settings.load()).refreshIntervalMinutes).toBe(7);
  });
});
