import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  ArchiveManifest,
  DailyRecord,
  ModelBreakdown,
  RecordTotals,
  SessionRecord,
} from "./types.js";

// Bump when the on-disk record shape changes; a reader seeing an older version
// in manifest.json must migrate before merging. See docs/adr for the rationale.
export const ARCHIVE_SCHEMA_VERSION = 1;

// --- Pure merge logic ("keep richest, never shrink") ----------------------
//
// These functions are data-in/data-out so the anti-purge guarantee is trivially
// unit-tested without touching the filesystem. The rule, applied per record and
// per model line: keep max() of every token field, let cost follow the snapshot
// with the larger token total (ties → the later capture, since prices can change
// retroactively but counts are ground truth), preserve firstCapturedAt, advance
// lastCapturedAt. `a` is the existing record, `b` the newer incoming one.

function tokenTotal(t: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}): number {
  return t.inputTokens + t.outputTokens + t.cacheCreationTokens + t.cacheReadTokens;
}

function mergeModelLine(a: ModelBreakdown, b: ModelBreakdown): ModelBreakdown {
  const inputTokens = Math.max(a.inputTokens, b.inputTokens);
  const outputTokens = Math.max(a.outputTokens, b.outputTokens);
  const cacheCreationTokens = Math.max(a.cacheCreationTokens, b.cacheCreationTokens);
  const cacheReadTokens = Math.max(a.cacheReadTokens, b.cacheReadTokens);
  // Cost tracks the snapshot with the larger token total; a tie keeps the later
  // capture (b) so a retroactive re-price wins while counts hold steady.
  const cost = tokenTotal(a) > tokenTotal(b) ? a.cost : b.cost;
  return {
    modelName: a.modelName,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    totalTokens: inputTokens + outputTokens + cacheCreationTokens + cacheReadTokens,
    cost,
  };
}

/** Union of two per-model breakdown lists, merging matches and sorting by name. */
export function mergeModelBreakdowns(
  existing: ModelBreakdown[],
  incoming: ModelBreakdown[],
): ModelBreakdown[] {
  const byName = new Map<string, ModelBreakdown>();
  for (const model of existing) {
    byName.set(model.modelName, model);
  }
  for (const model of incoming) {
    const prev = byName.get(model.modelName);
    byName.set(model.modelName, prev ? mergeModelLine(prev, model) : model);
  }
  return [...byName.values()].sort((x, y) => x.modelName.localeCompare(y.modelName));
}

/** Record totals are always the rollup of the merged model lines (totals = Σ models). */
export function rollupTotals(models: ModelBreakdown[]): RecordTotals {
  const totals: RecordTotals = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: 0,
    totalCost: 0,
  };
  for (const model of models) {
    totals.inputTokens += model.inputTokens;
    totals.outputTokens += model.outputTokens;
    totals.cacheCreationTokens += model.cacheCreationTokens;
    totals.cacheReadTokens += model.cacheReadTokens;
    totals.totalTokens += model.totalTokens;
    totals.totalCost += model.cost;
  }
  return totals;
}

function earliest(a: string | undefined, b: string): string {
  if (!a) {
    return b;
  }
  return a < b ? a : b;
}

function latest(a: string | undefined, b: string): string {
  if (!a) {
    return b;
  }
  return a > b ? a : b;
}

function unionSorted(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])].sort();
}

export function mergeDailyRecord(
  existing: DailyRecord | undefined,
  incoming: DailyRecord,
): DailyRecord {
  const models = existing
    ? mergeModelBreakdowns(existing.models, incoming.models)
    : mergeModelBreakdowns([], incoming.models);
  return {
    date: incoming.date,
    timezone: incoming.timezone || existing?.timezone || incoming.timezone,
    agents: unionSorted(existing?.agents ?? [], incoming.agents),
    totals: rollupTotals(models),
    models,
    firstCapturedAt: earliest(existing?.firstCapturedAt, incoming.firstCapturedAt),
    lastCapturedAt: latest(existing?.lastCapturedAt, incoming.lastCapturedAt),
  };
}

export function mergeSessionRecord(
  existing: SessionRecord | undefined,
  incoming: SessionRecord,
): SessionRecord {
  const models = existing
    ? mergeModelBreakdowns(existing.models, incoming.models)
    : mergeModelBreakdowns([], incoming.models);
  return {
    sessionId: incoming.sessionId,
    agent: incoming.agent || existing?.agent || incoming.agent,
    lastActivity: latest(existing?.lastActivity, incoming.lastActivity),
    totals: rollupTotals(models),
    models,
    firstCapturedAt: earliest(existing?.firstCapturedAt, incoming.firstCapturedAt),
    lastCapturedAt: latest(existing?.lastCapturedAt, incoming.lastCapturedAt),
  };
}

// Content comparison drives the dirty check: capture timestamps are excluded so
// an unchanged 60s re-capture neither rewrites the file nor advances the stamp.
function modelsEqual(a: ModelBreakdown[], b: ModelBreakdown[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((model, i) => {
    const other = b[i];
    return (
      model.modelName === other.modelName &&
      model.inputTokens === other.inputTokens &&
      model.outputTokens === other.outputTokens &&
      model.cacheCreationTokens === other.cacheCreationTokens &&
      model.cacheReadTokens === other.cacheReadTokens &&
      model.cost === other.cost
    );
  });
}

export function dailyContentEqual(a: DailyRecord, b: DailyRecord): boolean {
  return (
    a.date === b.date &&
    a.timezone === b.timezone &&
    a.agents.length === b.agents.length &&
    a.agents.every((agent, i) => agent === b.agents[i]) &&
    a.totals.totalCost === b.totals.totalCost &&
    a.totals.totalTokens === b.totals.totalTokens &&
    modelsEqual(a.models, b.models)
  );
}

export function sessionContentEqual(a: SessionRecord, b: SessionRecord): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.agent === b.agent &&
    a.lastActivity === b.lastActivity &&
    a.totals.totalCost === b.totals.totalCost &&
    a.totals.totalTokens === b.totals.totalTokens &&
    modelsEqual(a.models, b.models)
  );
}

// --- Atomic JSON IO -------------------------------------------------------

// fs seams are injectable so the temp-then-rename guarantee can be tested by
// forcing the rename to fail and asserting the destination is never partial.
export type AtomicWriteDeps = {
  mkdir: typeof fs.mkdir;
  writeFile: typeof fs.writeFile;
  rename: typeof fs.rename;
};

const defaultAtomicDeps: AtomicWriteDeps = {
  mkdir: fs.mkdir,
  writeFile: fs.writeFile,
  rename: fs.rename,
};

let tmpCounter = 0;

export async function atomicWriteJson(
  filePath: string,
  data: unknown,
  deps: AtomicWriteDeps = defaultAtomicDeps,
): Promise<void> {
  // Serialize before opening any file so a non-serializable payload can never
  // leave a half-written temp behind.
  const body = JSON.stringify(data, null, 2);
  await deps.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${tmpCounter++}.tmp`;
  await deps.writeFile(tmp, body, "utf8");
  try {
    await deps.rename(tmp, filePath);
  } catch (error) {
    // Rename failed → destination still holds its previous complete content.
    // Drop the orphan temp so a crash here doesn't litter the archive.
    await fs.rm(tmp, { force: true }).catch(() => {});
    throw error;
  }
}

async function readJson<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

/** UTC month shard a session lives in; storage-only, independent of display tz. */
function sessionMonth(record: SessionRecord): string {
  return record.lastActivity.slice(0, 7);
}

// --- The archive store ----------------------------------------------------

export class ArchiveStore {
  private readonly dailyDir: string;
  private readonly sessionsDir: string;
  private readonly manifestPath: string;

  constructor(private readonly baseDir: string) {
    this.dailyDir = path.join(baseDir, "daily");
    this.sessionsDir = path.join(baseDir, "sessions");
    this.manifestPath = path.join(baseDir, "manifest.json");
  }

  async readDaily(date: string): Promise<DailyRecord | undefined> {
    return readJson<DailyRecord>(path.join(this.dailyDir, `${date}.json`));
  }

  async readAllDaily(): Promise<DailyRecord[]> {
    const files = await listJsonFiles(this.dailyDir);
    const records = await Promise.all(
      files.map((file) => readJson<DailyRecord>(path.join(this.dailyDir, file))),
    );
    return records
      .filter((record): record is DailyRecord => record !== undefined)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async readAllSessions(): Promise<SessionRecord[]> {
    const files = await listJsonFiles(this.sessionsDir);
    const months = await Promise.all(
      files.map((file) =>
        readJson<Record<string, SessionRecord>>(path.join(this.sessionsDir, file)),
      ),
    );
    return months.flatMap((month) => (month ? Object.values(month) : []));
  }

  async readManifest(): Promise<ArchiveManifest | undefined> {
    return readJson<ArchiveManifest>(this.manifestPath);
  }

  /**
   * Whether this build may write to the archive. An absent or same/older-version
   * manifest is safe; a manifest from a NEWER Burnbar is not — merging into a
   * future format could corrupt it, so the caller should skip writes and migrate.
   */
  async isSchemaCompatible(): Promise<boolean> {
    const manifest = await this.readManifest();
    return manifest === undefined || manifest.schemaVersion <= ARCHIVE_SCHEMA_VERSION;
  }

  /**
   * Merge one day's record into the archive. Writes only when the stored
   * numbers actually change (the dirty check), so the 60s tray refresh is a
   * no-op on quiet days. Returns whether anything was persisted.
   */
  async mergeDaily(incoming: DailyRecord): Promise<{ changed: boolean; record: DailyRecord }> {
    const existing = await this.readDaily(incoming.date);
    const merged = mergeDailyRecord(existing, incoming);
    const changed = !existing || !dailyContentEqual(existing, merged);
    if (changed) {
      await atomicWriteJson(path.join(this.dailyDir, `${incoming.date}.json`), merged);
      return { changed, record: merged };
    }
    return { changed, record: existing };
  }

  /**
   * Merge a batch of sessions. Loads every shard into one map first so a session
   * that crossed a month boundary moves shards cleanly (no duplicate across two
   * files); single-user volumes make this trivially cheap. Returns the count of
   * sessions whose stored numbers changed.
   */
  async mergeSessions(incoming: SessionRecord[]): Promise<number> {
    if (incoming.length === 0) {
      return 0;
    }
    const all = new Map<string, SessionRecord>();
    for (const record of await this.readAllSessions()) {
      all.set(record.sessionId, record);
    }

    let changed = 0;
    const touchedMonths = new Set<string>();
    for (const session of incoming) {
      const prev = all.get(session.sessionId);
      const merged = mergeSessionRecord(prev, session);
      if (prev && sessionContentEqual(prev, merged)) {
        continue;
      }
      changed++;
      if (prev && sessionMonth(prev) !== sessionMonth(merged)) {
        touchedMonths.add(sessionMonth(prev));
      }
      all.set(session.sessionId, merged);
      touchedMonths.add(sessionMonth(merged));
    }

    for (const month of touchedMonths) {
      const shard: Record<string, SessionRecord> = {};
      for (const record of all.values()) {
        if (sessionMonth(record) === month) {
          shard[record.sessionId] = record;
        }
      }
      await atomicWriteJson(path.join(this.sessionsDir, `${month}.json`), shard);
    }
    return changed;
  }

  /** Record/refresh archive-wide metadata; firstCaptureAt is set once and held. */
  async updateManifest(opts: {
    timezone: string;
    ccusageVersion: string;
    capturedAt: string;
  }): Promise<void> {
    const existing = await this.readManifest();
    const manifest: ArchiveManifest = {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      timezone: opts.timezone,
      ccusageVersion: opts.ccusageVersion,
      firstCaptureAt: existing?.firstCaptureAt ?? opts.capturedAt,
      lastCaptureAt: opts.capturedAt,
    };
    await atomicWriteJson(this.manifestPath, manifest);
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((entry) => entry.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
