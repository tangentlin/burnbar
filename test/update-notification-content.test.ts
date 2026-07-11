import { describe, expect, it } from "vitest";
import { upgradedVersion } from "../src/update-notification-content.js";

describe("upgradedVersion", () => {
  it("returns the current version when it changed from a recorded previous one", () => {
    expect(upgradedVersion("1.0.0", "1.1.0")).toBe("1.1.0");
  });

  it("returns null on the first run ever (no recorded previous version)", () => {
    expect(upgradedVersion(undefined, "1.1.0")).toBeNull();
  });

  it("returns null when the same version simply restarts", () => {
    expect(upgradedVersion("1.1.0", "1.1.0")).toBeNull();
  });
});
