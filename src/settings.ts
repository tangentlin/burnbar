import * as fs from "node:fs/promises";
import { atomicWriteJson } from "./store.js";
import type { AppSettings } from "./types.js";

export const DEFAULT_REFRESH_INTERVAL_MINUTES = 15;

// Common presets offered in the tray's Auto-Refresh submenu (minutes; 0 = manual).
// A stored value outside this set is still honored and shown as "Custom".
export const REFRESH_PRESETS_MINUTES = [0, 5, 10, 15, 30, 60];

/** Non-negative integer minutes; 0 keeps "manual"; anything bogus falls back to the default. */
function sanitizeMinutes(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_REFRESH_INTERVAL_MINUTES;
  }
  return Math.floor(value);
}

/**
 * Reads/writes `settings.json` under userData. Tiny by design — the only setting
 * today is the refresh interval. Writes are atomic (reused from the store) so a
 * crash mid-write never corrupts preferences.
 */
export class SettingsStore {
  private settings: AppSettings = { refreshIntervalMinutes: DEFAULT_REFRESH_INTERVAL_MINUTES };

  constructor(private readonly filePath: string) {}

  /** Load from disk; a missing or unreadable file leaves defaults in place. */
  async load(): Promise<AppSettings> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, "utf8")) as Partial<AppSettings>;
      this.settings = { refreshIntervalMinutes: sanitizeMinutes(parsed.refreshIntervalMinutes) };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to read settings; using defaults:", error);
      }
    }
    return this.settings;
  }

  get(): AppSettings {
    return this.settings;
  }

  getRefreshIntervalMinutes(): number {
    return this.settings.refreshIntervalMinutes;
  }

  async setRefreshIntervalMinutes(minutes: number): Promise<AppSettings> {
    this.settings = { ...this.settings, refreshIntervalMinutes: sanitizeMinutes(minutes) };
    await atomicWriteJson(this.filePath, this.settings);
    return this.settings;
  }
}
