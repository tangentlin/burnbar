import { localDateString } from "./time.js";
import type {
  DailyRecord,
  DashboardSeries,
  SeriesDataset,
  SeriesDimension,
  SeriesRange,
  SessionRecord,
} from "./types.js";

// Read-time derivation: archive records → a chart-ready series. Pure (data in →
// data out) so each view is unit-tested against fixtures with no IO. All three
// views share one continuous daily axis; gaps are zero-filled so the time scale
// reads honestly and stacked datasets stay aligned.

const RANGE_DAYS: Record<Exclude<SeriesRange, "all">, number> = {
  "30d": 30,
  "90d": 90,
};

/** Shift a YYYY-MM-DD by whole days via UTC math (tz-agnostic, calendar-correct). */
function shiftDate(date: string, deltaDays: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day) + deltaDays * 86_400_000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function rangeStart(range: SeriesRange, today: string, sourceDates: string[]): string {
  if (range !== "all") {
    return shiftDate(today, -(RANGE_DAYS[range] - 1));
  }
  // "all": anchor to the earliest date present in the relevant source.
  const earliest = sourceDates.reduce((min, date) => (date < min ? date : min), today);
  return earliest < today ? earliest : today;
}

function dateAxis(start: string, end: string): string[] {
  const labels: string[] = [];
  for (let date = start; date <= end; date = shiftDate(date, 1)) {
    labels.push(date);
  }
  return labels;
}

/** Local YYYY-MM-DD a session is attributed to; null for an unparseable stamp. */
function sessionLocalDate(session: SessionRecord, tz: string): string | null {
  const instant = new Date(session.lastActivity);
  if (Number.isNaN(instant.getTime())) {
    return null;
  }
  return localDateString(tz, instant);
}

function costByDate(daily: DailyRecord[], labels: string[]): SeriesDataset {
  const byDate = new Map(daily.map((record) => [record.date, record.totals.totalCost]));
  return { label: "Cost", data: labels.map((date) => byDate.get(date) ?? 0) };
}

function costByModel(
  daily: DailyRecord[],
  labels: string[],
  inRange: Set<string>,
): SeriesDataset[] {
  const visible = daily.filter((record) => inRange.has(record.date));
  const byDate = new Map(visible.map((record) => [record.date, record]));
  const modelNames = [
    ...new Set(visible.flatMap((record) => record.models.map((model) => model.modelName))),
  ].sort();
  return modelNames.map((modelName) => ({
    label: modelName,
    data: labels.map((date) => {
      const model = byDate.get(date)?.models.find((entry) => entry.modelName === modelName);
      return model?.cost ?? 0;
    }),
  }));
}

function costByAgent(
  sessions: SessionRecord[],
  labels: string[],
  tz: string,
  inRange: Set<string>,
): SeriesDataset[] {
  // Aggregate sessions to (local last-activity day, agent). Known v1 approximation:
  // a long session lands wholly on its last-activity day, so by-agent daily totals
  // can drift slightly from the authoritative daily totals near day boundaries.
  const byDateAgent = new Map<string, Map<string, number>>();
  const agents = new Set<string>();
  for (const session of sessions) {
    const date = sessionLocalDate(session, tz);
    if (date === null || !inRange.has(date)) {
      continue;
    }
    agents.add(session.agent);
    const perAgent = byDateAgent.get(date) ?? new Map<string, number>();
    perAgent.set(session.agent, (perAgent.get(session.agent) ?? 0) + session.totals.totalCost);
    byDateAgent.set(date, perAgent);
  }
  return [...agents].sort().map((agent) => ({
    label: agent,
    data: labels.map((date) => byDateAgent.get(date)?.get(agent) ?? 0),
  }));
}

export function deriveSeries(
  daily: DailyRecord[],
  sessions: SessionRecord[],
  options: { range: SeriesRange; dimension: SeriesDimension; timezone: string; today: string },
): DashboardSeries {
  const { range, dimension, timezone, today } = options;

  const sourceDates =
    dimension === "agent"
      ? sessions
          .map((session) => sessionLocalDate(session, timezone))
          .filter((date): date is string => date !== null)
      : daily.map((record) => record.date);

  const start = rangeStart(range, today, sourceDates);
  const labels = dateAxis(start, today);
  const inRange = new Set(labels);

  let datasets: SeriesDataset[];
  if (dimension === "model") {
    datasets = costByModel(daily, labels, inRange);
  } else if (dimension === "agent") {
    datasets = costByAgent(sessions, labels, timezone, inRange);
  } else {
    datasets = [costByDate(daily, labels)];
  }

  const totalCost = datasets.reduce(
    (sum, dataset) => sum + dataset.data.reduce((acc, value) => acc + value, 0),
    0,
  );

  return { range, dimension, labels, datasets, totalCost };
}
