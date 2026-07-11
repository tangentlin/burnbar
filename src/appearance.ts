import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IconAppearance } from "./tray-icon.js";

const execFileAsync = promisify(execFile);

/**
 * Dependency-injected `defaults read` invoker: returns stdout. Unit tests pass a
 * fixture so detection is exercised without spawning a process; production uses
 * {@link defaultAppearanceRunner}.
 */
export type AppearanceRunner = () => Promise<string>;

export const defaultAppearanceRunner: AppearanceRunner = async () => {
  const { stdout } = await execFileAsync("defaults", ["read", "-g", "AppleInterfaceStyle"]);
  return stdout;
};

export type DetectAppearanceOptions = {
  runner?: AppearanceRunner;
  /**
   * Used only when `defaults` itself can't run (non-macOS, a sandboxed test
   * environment) — the caller (tray.ts) passes `nativeTheme.shouldUseDarkColors`
   * so this module stays Electron-free and unit-testable without the Electron
   * runtime (see vitest.config.ts). Defaults to "light".
   */
  fallback?: () => IconAppearance;
};

/**
 * The menu bar's actual light/dark appearance, read from the same NSUserDefaults
 * key AppKit itself keys menu-bar tinting off of (`AppleInterfaceStyle`), rather
 * than `nativeTheme.shouldUseDarkColors` — which tracks only the app's own UI
 * theme and is documented as unreliable for the tray specifically (see
 * electron/electron#25478, #21899), especially for a windowless, Dock-hidden app
 * like Burnbar. `defaults` exits non-zero with the key *absent* in light mode —
 * that's the normal signal, not a failure, so it resolves to `"light"`. Only an
 * unrunnable `defaults` binary (non-macOS, a sandboxed test environment) calls
 * `fallback`.
 */
export async function detectAppearance(
  options: DetectAppearanceOptions = {},
): Promise<IconAppearance> {
  const { runner = defaultAppearanceRunner, fallback = () => "light" } = options;
  try {
    const stdout = await runner();
    return stdout.trim() === "Dark" ? "dark" : "light";
  } catch (error) {
    return isCommandMissing(error) ? fallback() : "light";
  }
}

function isCommandMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}
