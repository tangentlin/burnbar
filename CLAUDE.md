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

Burnbar — a macOS menu bar application that visualizes Claude Code token burn and cost. It shells out to the bundled `ccusage` CLI (which reads local `~/.claude` usage logs and prices them per model) and renders today's and all-time totals in the tray. Backend-agnostic (Anthropic / Vertex AI / Bedrock). Built with TypeScript, Electron, and an ES module architecture.

> 📚 Full LLM-oriented docs live in [docs/](docs/) — start at [docs/AGENTS.md](docs/AGENTS.md). Keep them in sync when you change behavior, types, or packaging.

## Development Requirements

- Run oxlint (lint) and oxfmt (format) every time you change the code
- Use Node16 module system with explicit `.js` extensions for local imports
- Package.json has `"type": "module"` configured for ES module support

## Commands

```bash
# Development
npm run dev          # Compile TypeScript and start Electron
npm run build        # Compile TypeScript only
npm start            # Run Electron (requires prior build)
npm run typecheck    # Type check without emitting files

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

The application follows Electron's single-process architecture with a tray-only design:

**Main Process** (`src/main.ts`):
- Application entry point and lifecycle management
- Initializes TrayManager when app is ready
- Hides dock icon on macOS for menu bar-only operation

**TrayManager** (`src/tray.ts`):
- System tray lifecycle management with ES module compatibility
- Menu construction and updates with formatted usage data
- Handles platform-specific tray behavior (macOS context menu vs click events)
- Uses `fileURLToPath(import.meta.url)` for `__dirname` replacement in ES modules

**Usage Module** (`src/usage.ts`):
- Spawns the bundled ccusage CLI (`ccusage daily --json --mode calculate`) via the current runtime, parsing its JSON output
- Derives today from the single daily report and reads all-time grand totals (no second scan)
- Error handling for missing/unreadable usage data with graceful fallbacks

**Type Definitions** (`src/types.ts`):
- Core data structures for usage statistics and API responses
- TypeScript interfaces for type safety across modules

**Key Functions**:
- `getUserUsage()`: Spawns the ccusage CLI, parses its JSON, derives today + all-time totals
- `TrayManager.initializeTray()`: Creates tray icon and sets up event handlers
- `TrayManager.refreshTrayMenu()`: Builds context menu with formatted usage data

**Data Flow**:
1. Resolve the bundled ccusage CLI entry via `createRequire(...).resolve("ccusage/src/cli.js")`
2. Spawn it through the current runtime (`process.execPath`) with `ELECTRON_RUN_AS_NODE=1` — no external `node`/`ccusage` needed
3. Parse stdout JSON into the `CcusageDailyReport` subset
4. Derive today from `daily[]` (match `period` to today's ISO date) and read `totals`; format for the tray menu
5. Handle errors gracefully with fallback messaging (`UsageData.error`)

## ccusage Integration Details

The app uses ccusage 20.x, which ships **as a CLI only** (no library exports), so Burnbar invokes its bundled `cli.js` and parses the JSON it prints:

```typescript
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const CCUSAGE_CLI = require.resolve("ccusage/src/cli.js");

// Running ccusage through the current runtime's own binary (Electron in
// production, Node in tests) via ELECTRON_RUN_AS_NODE keeps the app
// self-contained. `--mode calculate` prices from local logs, so this is
// backend-agnostic (Anthropic / Vertex AI / Bedrock).
const { stdout } = await execFileAsync(
  process.execPath,
  [CCUSAGE_CLI, "daily", "--json", "--mode", "calculate"],
  { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, maxBuffer: 64 * 1024 * 1024 },
);
const report = JSON.parse(stdout); // { daily: [{ period, totalTokens, totalCost }], totals: {...} }
```

> ⚠️ Launch gotcha: an _inherited_ `ELECTRON_RUN_AS_NODE` (e.g. terminals inside an Electron-based IDE) breaks Burnbar's own launch. Run with `env -u ELECTRON_RUN_AS_NODE`. See [docs/adr/002-electron-run-as-node.md](docs/adr/002-electron-run-as-node.md).

## TypeScript Configuration

- Uses Node16 module system with Node16 module resolution
- Requires explicit `.js` extensions for local module imports in TypeScript files
- ES module interop enabled with `esModuleInterop: true`
- Outputs to `./dist` directory with source maps enabled

## File Structure

```
src/
├── main.ts        # Application entry point
├── tray.ts        # Tray management and menu creation
├── usage.ts       # Usage data fetching via ccusage
└── types.ts       # TypeScript type definitions
assets/
└── icon.png       # Tray icon
dist/              # TypeScript output (git-ignored)
release/           # electron-builder output (git-ignored)
```

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
