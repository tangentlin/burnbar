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

macOS menu bar application that visualizes Claude Code usage costs using the `ccusage` npm library to read local usage history files. Built with TypeScript, Electron, and follows ES module architecture.

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
- Data fetching using static imports from ccusage library
- Aggregates today's usage and calculates all-time totals
- Error handling for missing usage data with graceful fallbacks

**Type Definitions** (`src/types.ts`):
- Core data structures for usage statistics and API responses
- TypeScript interfaces for type safety across modules

**Key Functions**:
- `getUserUsage()`: Uses ccusage `loadDailyUsageData`, `calculateTotals`, and `createTotalsObject`
- `TrayManager.initializeTray()`: Creates tray icon and sets up event handlers
- `TrayManager.refreshTrayMenu()`: Builds context menu with formatted usage data

**Data Flow**:
1. Import ccusage modules using static ES module imports
2. Load today's usage data with `since` parameter for current date
3. Load all-time usage data without date filter
4. Calculate totals and format for display in tray menu
5. Handle errors gracefully with fallback messaging

## ccusage Integration Details

The app uses ccusage v0.8.0+ and leverages its ESM modules with static imports:

```typescript
import { calculateTotals, createTotalsObject } from "ccusage/calculate-cost";
import { loadDailyUsageData } from "ccusage/data-loader";

// Get today's usage (YYYYMMDD format)
const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const todayData = await loadDailyUsageData({ since: today });

// Get all-time usage and calculate totals
const allTimeData = await loadDailyUsageData();
const allTimeTotals = calculateTotals(allTimeData);
const totalsObject = createTotalsObject(allTimeTotals);
```

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

5. **Get SHA256 hashes for Homebrew**:
   ```bash
   shasum -a 256 "release/Claude Usage Tracker-X.X.X.dmg"
   shasum -a 256 "release/Claude Usage Tracker-X.X.X-arm64.dmg"
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
