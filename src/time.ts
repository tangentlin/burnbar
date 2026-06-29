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

/** Friendly "5 minutes ago" / "just now" for the menu's last-updated stamp. */
export function formatRelativeTime(iso: string | null, now: Date = new Date()): string {
  if (!iso) {
    return "never";
  }
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000);
  if (seconds < 0) {
    return "just now";
  }
  if (seconds < 45) {
    return "just now";
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes <= 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/** Human label for a refresh interval in minutes (0 = manual). */
export function formatIntervalLabel(minutes: number): string {
  if (minutes <= 0) {
    return "Manual";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = minutes / 60;
  return Number.isInteger(hours) ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${minutes} min`;
}
