# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Behavioral Rules

**Scrutinize first, build second** — Before any task, surface ambiguities, unstated assumptions, edge cases, and blindspots. Assume as little as possible; don't accept requirements at face value, and never silently pick one of several valid approaches — present tradeoffs with a recommendation.

**Ask in batches of 4** — Surface discovered ambiguities as questions in groups of up to 4. For each question, use whatever format fits best — multiple-choice options when the answer space is enumerable, open-ended when it isn't with AskUserQuestion tool. Keep iterating in rounds of 4 until no ambiguity remains. Use this format:

> Before I start, I want to make sure we're aligned:
>
> 1. **[Topic]** — [Question]
>    - A) [option] — [tradeoff]
>    - B) [option] — [tradeoff]
> 2. **[Topic]** — [Question]
> 3. **[Topic]** — [Open-ended question]

**Keep docs in sync** — If you change code that a doc describes, update the doc. Each package has its own Documentation Freshness Rules — consult the relevant package's `CLAUDE.md`. And mind the **altitude** when you do: name the concept and point to the canonical symbol — don't transcribe type shapes or constants the code already owns.

### Engineering stance

Default to a **senior engineer**: reason from first principles; favor decoupled, SOLID design; write self-explanatory code (comments explain _why_, not _what_). Keep it **right-sized** — SOLID serves real, present complexity, never speculative abstraction or premature flexibility; if code can be shorter or flatter without losing clarity, rewrite it. Verify against criteria (test / typecheck / lint / observed behavior), not by inspection.

### Scope discipline

Change only what the task needs. **Follow house conventions** (naming, no barrel files, structure, styling); these are not "status quo" to improve. But **don't inherit bad architecture** — coupling, leaky abstractions, duplication, God objects rank below sound design. **Never silently refactor adjacent or out-of-scope code** — surface it instead (below).

_The Engineering stance and Scope discipline above fold in Andrej Karpathy's four LLM-coding principles: think before coding, simplicity first, surgical changes, goal-driven execution._

### Adjacent code-smell protocol

When you spot a code-smell next to your work:

1. Name the better option in a sentence or two — what it is and which SOLID/decoupling principle it serves.
2. Offer a 3-way choice (use the _Ask in batches of 3_ format) and surface it with AskUserQuestion tool:
   - **(a)** Apply it now, in scope.
   - **(b) (recommended)** Apply it now **and** file a tech-debt JIRA for the rest.
   - **(c)** Leave it (status quo).
3. Lean to **(b)** when the fix is real but would balloon the diff. If there's no genuinely better option, say so and move on.

## Project Overview

Burnbar — a macOS menu bar application that visualizes Claude Code (and other agent CLIs') token burn and cost. It shells out to the bundled `ccusage` CLI (which reads local agent logs and prices them per model) and renders today's and all-time totals in the tray. It also keeps a **durable, numbers-only usage archive** under the app's `userData` dir (so history survives the source tools purging their logs) and ships a **Chart.js dashboard** to visualize it. Backend-agnostic (Anthropic / Vertex AI / Bedrock). Built with TypeScript, Electron, and an ES module architecture.

> 📚 Full LLM-oriented docs live in [docs/](docs/) — start at [docs/AGENTS.md](docs/AGENTS.md). Keep them in sync when you change behavior, types, or packaging.

## Development Requirements

- Run oxlint (lint) and oxfmt (format) every time you change the code
- Run Vitest (`pnpm test`) when you touch the pure logic (merge/normalize/derive/atomic IO)
- Use Node16 module system with explicit `.js` extensions for local imports
- Package.json has `"type": "module"` configured for ES module support
- The renderer (`src/dashboard/`) is bundled by **esbuild** (not `tsc`) and type-checked via `tsconfig.dashboard.json`; the preload is `src/preload.mts` → `dist/preload.mjs`

## Commands

```bash
# Development
npm run dev          # Build (tsc + renderer) and start Electron
npm run build        # tsc + esbuild renderer bundle → dist/
npm run build:renderer # esbuild-bundle src/dashboard (+ Chart.js) → dist/dashboard
npm start            # Run Electron (requires prior build)
npm run typecheck    # Type check main + dashboard configs (no emit)

# Tests
npm run test         # Vitest run (merge/normalize/derive/atomic IO)
npm run test:watch   # Vitest watch
npm run test:coverage # Vitest with coverage

# Code Quality
npm run lint         # Run oxlint
npm run lint:fix     # Auto-fix lint issues (oxlint --fix)
npm run format       # Check formatting (oxfmt --check)
npm run format:write # Format code in place (oxfmt)
npm run check        # Lint + format check (oxlint && oxfmt --check)
npm run check:fix    # Auto-fix lint + format (oxlint --fix && oxfmt)

# Distribution
npm run dist         # Build and package for current platform
npm run dist:mac     # Build DMG and ZIP for macOS (both architectures)
npm run dist:mac:universal  # Build universal macOS app
```

## Architecture

Single Electron **main** process, tray-first, with one on-demand dashboard window. The full module map and data-flow diagrams live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — this is the orientation:

- **`src/main.ts`** — wires the collaborators (`ArchiveStore`, `CaptureService`, `TrayManager`, `DashboardWindow`, archive IPC), hides the Dock, and runs a bounded quit-time flush.
- **`src/capture-service.ts`** — `CaptureService` owns the single ccusage `daily` call that feeds **both** the tray and the archive on the configurable refresh interval (default 15 min; `0` = manual) plus "Refresh Now" (sessions on launch / day-rollover / quit). Best-effort: a failure never crashes the tray.
- **`src/capture.ts`** — spawns ccusage through a dependency-injected runner and normalizes `daily`/`session` reports into archive records; also derives the tray `UsageData`. (Absorbed the old `usage.ts`.)
- **`src/store.ts`** — `ArchiveStore`: the **pure** "keep richest, never shrink" merge plus atomic temp-then-rename JSON IO, monthly-sharded sessions, and the manifest. Highest-stakes module.
- **`src/derive.ts`** — **pure** archive → `DashboardSeries` (cost over time, by model, by agent; 30d/90d/all).
- **`src/time.ts`** — `systemTimezone` / `localDateString`; the pinned IANA tz passed to ccusage (`-z`) and recorded in the manifest.
- **`src/tray.ts`** — **display-only** `TrayManager`: renders the pushed state as a rich bitmap "stats card" (today + 30-day spend/tokens, bar chart, top model) plus Refresh / Auto-Refresh / Open Dashboard / **About Burnbar** rows.
- **`src/menu-card-window.ts` / `src/menu-card/`** — the card renderer: `MenuCardRenderer` drives a hidden `BrowserWindow` whose canvas (`__burnbarDrawCard`) draws the card and returns a PNG the tray shows as a menu-item icon. See [docs/adr/009](docs/adr/009-menu-stats-card.md).
- **`src/ipc.ts` / `src/preload.mts` / `src/window.ts` / `src/dashboard/`** — the read-only `archive:get-series` channel and the Chart.js dashboard (contextIsolation on, nodeIntegration off).
- **`src/types.ts`** — shared contracts: tray DTOs, ccusage raw subset, archive records, dashboard series.

**Data flow (capture):** `CaptureService` → `capture.ts` spawns ccusage (`-z <tz>`) → the daily report becomes `UsageData` (pushed to the tray) **and** is normalized + merged into the archive under keep-richest, written atomically and only when a day's numbers change. **Data flow (dashboard):** renderer → `window.burnbar.getSeries` (preload) → IPC → `store.readAll*` + `deriveSeries` → `DashboardSeries`. See the keep-richest rule in [docs/adr/007](docs/adr/007-keep-richest-merge.md) and the durable-archive rationale in [docs/adr/006](docs/adr/006-durable-usage-archive.md).

## ccusage Integration Details

The app uses ccusage 20.x, which ships **as a CLI only** (no library exports), so Burnbar invokes its bundled `cli.js` and parses the JSON it prints. The spawn is wrapped in a dependency-injected `CcusageRunner` so capture/normalize is unit-testable without a process (`src/capture.ts`):

```typescript
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const CCUSAGE_CLI = require.resolve("ccusage/src/cli.js");

// Running ccusage through the current runtime's own binary (Electron in
// production, Node in tests) via ELECTRON_RUN_AS_NODE keeps the app
// self-contained. `--mode calculate` prices from local logs (backend-agnostic);
// `-z <tz>` pins day buckets to the system IANA timezone.
const { stdout } = await execFileAsync(
  process.execPath,
  [CCUSAGE_CLI, "daily", "--json", "--mode", "calculate", "-z", tz],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, maxBuffer: 256 * 1024 * 1024 },
);
const report = JSON.parse(stdout); // { daily: [{ period, agent, totalTokens, totalCost, modelBreakdowns, metadata }], totals }
```

Burnbar also runs `ccusage session --json --mode calculate -z <tz>` (per-agent, per-session) to feed the by-agent dashboard view. Both top-level commands share one normalized row shape; the per-agent subcommands are **not** used (inconsistent schemas — see [docs/adr/007](docs/adr/007-keep-richest-merge.md)).

> ⚠️ Launch gotcha: an _inherited_ `ELECTRON_RUN_AS_NODE` (e.g. terminals inside an Electron-based IDE) breaks Burnbar's own launch. Run with `env -u ELECTRON_RUN_AS_NODE`. See [docs/adr/002-electron-run-as-node.md](docs/adr/002-electron-run-as-node.md).

## TypeScript Configuration

- Uses Node16 module system with Node16 module resolution
- Requires explicit `.js` extensions for local module imports in TypeScript files
- ES module interop enabled with `esModuleInterop: true`
- Outputs to `./dist` directory with source maps enabled

## File Structure

```
src/
├── main.ts            # Entry point: wires collaborators + quit flush
├── capture-service.ts # Owns the ccusage call feeding tray + archive
├── capture.ts         # ccusage spawn (DI runner) + normalizers + toUsageData
├── store.ts           # ArchiveStore: keep-richest merge + atomic IO + manifest
├── derive.ts          # Pure archive → dashboard series (cost + tokens)
├── settings.ts        # Persisted preferences (refresh interval; 0 = manual)
├── time.ts            # tz helpers + relative-time / interval formatting
├── tray.ts            # Display-only tray: title, menu, stats card, Refresh, Auto-Refresh, About
├── menu-card-window.ts # MenuCardRenderer: hidden window → canvas → card NativeImage
├── ipc.ts             # Read-only archive:get-series handler
├── preload.mts        # contextBridge → window.burnbar.getSeries (→ preload.mjs)
├── window.ts          # DashboardWindow (BrowserWindow + security)
├── types.ts           # Shared types incl. archive records + series
├── dashboard/         # Browser-context renderer (esbuild-bundled)
│   ├── index.html
│   ├── renderer.ts    # Chart.js wiring, range/dimension toggles
│   └── dashboard.css
└── menu-card/         # Browser-context card renderer (esbuild-bundled)
    ├── index.html
    └── card.ts        # Canvas → PNG stats card (__burnbarDrawCard)
test/                  # Vitest unit tests + JSON fixtures
scripts/build-renderer.mjs  # esbuild bundle for the renderers (dashboard + menu card)
assets/icon.png        # Tray icon
dist/                  # tsc + esbuild output (git-ignored)
release/               # electron-builder output (git-ignored)
```

Archive data lives in `app.getPath("userData")/archive` (per-day JSON + monthly session shards + `manifest.json`) — **never** in the repo, **never** transmitted off-device.

## Release Process

When creating a new release:

1. **Update version in package.json**:
   ```bash
   # Edit package.json to update version number
   ```

2. **Run linting and formatting**:
   ```bash
   npm run lint
   npm run format
   npm run check
   ```

3. **Commit and tag the release**:
   ```bash
   git add package.json
   git commit -m "chore: bump version to X.X.X"
   git tag vX.X.X
   ```

4. **Build the macOS releases** (requires Apple notarization credentials):
   ```bash
   APPLE_ID="your-apple-id@email.com" \
   APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx" \
   APPLE_TEAM_ID="YOUR_TEAM_ID" \
   npm run dist:mac
   ```

5. **Get SHA256 hashes for Homebrew** (electron-builder writes artifacts to `release/` as `Burnbar-X.X.X*`):
   ```bash
   shasum -a 256 "release/Burnbar-X.X.X.dmg"
   shasum -a 256 "release/Burnbar-X.X.X-arm64.dmg"
   ```

6. **Push to GitHub**:
   ```bash
   git push origin main
   git push origin vX.X.X
   ```

7. **Create GitHub Release**:
   - Go to GitHub releases page
   - Create release from the vX.X.X tag
   - Upload the DMG files from the release/ directory

8. **Update Homebrew Cask**:
   - Update version and SHA256 hashes in homebrew-claude-usage-tracker repository
   - Create and merge PR for the Homebrew formula update
