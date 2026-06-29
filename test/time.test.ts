import { describe, expect, it } from "vitest";
import { formatIntervalLabel, formatRelativeTime, localDateString } from "../src/time.js";

const BASE = new Date("2026-06-28T12:00:00.000Z");

describe("formatRelativeTime", () => {
  it("reports 'never' for a null stamp", () => {
    expect(formatRelativeTime(null, BASE)).toBe("never");
  });

  it("collapses recent stamps to 'just now'", () => {
    expect(formatRelativeTime("2026-06-28T11:59:30.000Z", BASE)).toBe("just now");
  });

  it("uses singular/plural minutes", () => {
    expect(formatRelativeTime("2026-06-28T11:59:00.000Z", BASE)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-06-28T11:45:00.000Z", BASE)).toBe("15 minutes ago");
  });

  it("rolls up to hours and days", () => {
    expect(formatRelativeTime("2026-06-28T09:00:00.000Z", BASE)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-06-26T12:00:00.000Z", BASE)).toBe("2 days ago");
  });
});

describe("formatIntervalLabel", () => {
  it("labels manual, minutes, and hours", () => {
    expect(formatIntervalLabel(0)).toBe("Manual");
    expect(formatIntervalLabel(15)).toBe("15 min");
    expect(formatIntervalLabel(60)).toBe("1 hour");
    expect(formatIntervalLabel(120)).toBe("2 hours");
  });
});

describe("localDateString", () => {
  it("buckets an instant by the given timezone", () => {
    expect(localDateString("America/New_York", new Date("2026-06-28T03:30:00.000Z"))).toBe(
      "2026-06-27",
    );
    expect(localDateString("UTC", new Date("2026-06-28T03:30:00.000Z"))).toBe("2026-06-28");
  });
});
