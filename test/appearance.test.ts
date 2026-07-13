import { describe, expect, it } from "vitest";
import { detectAppearance } from "../src/appearance.js";

const enoentError = (): NodeJS.ErrnoException => {
  const error = new Error("spawn defaults ENOENT") as NodeJS.ErrnoException;
  error.code = "ENOENT";
  return error;
};

describe("detectAppearance", () => {
  it("resolves dark when defaults reports the Dark interface style", async () => {
    const appearance = await detectAppearance({ runner: async () => "Dark\n" });
    expect(appearance).toBe("dark");
  });

  it("resolves light when defaults reports any other value", async () => {
    const appearance = await detectAppearance({ runner: async () => "Light\n" });
    expect(appearance).toBe("light");
  });

  it("resolves light when the key is absent — defaults exits non-zero, the normal light-mode signal", async () => {
    const appearance = await detectAppearance({
      runner: async () => {
        throw new Error(
          "The domain/default pair of (kCFPreferencesAnyApplication, AppleInterfaceStyle) does not exist",
        );
      },
    });
    expect(appearance).toBe("light");
  });

  it("falls back to the injected appearance only when the defaults binary itself can't run", async () => {
    const appearance = await detectAppearance({
      runner: async () => {
        throw enoentError();
      },
      fallback: () => "dark",
    });
    expect(appearance).toBe("dark");
  });

  it("defaults the fallback to light when none is supplied", async () => {
    const appearance = await detectAppearance({
      runner: async () => {
        throw enoentError();
      },
    });
    expect(appearance).toBe("light");
  });
});
