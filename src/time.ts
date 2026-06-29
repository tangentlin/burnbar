// Pure timezone helpers shared by capture, derivation, and orchestration. Kept
// dependency-free so the read-time logic that imports them is trivially testable
// without dragging in the ccusage runner.

/** System IANA timezone (e.g. "America/New_York"); pinned and passed to ccusage. */
export function systemTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** Local YYYY-MM-DD for an instant in `tz` — matches ccusage's `-z` day buckets. */
export function localDateString(tz: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
