# 🔥 Burnbar

A macOS menu bar app that shows your **Claude Code token burn and cost** at a glance — today's spend sits right in the menu bar, with all-time totals one click away.

> Forked from [penicillin0/claude-usage-tracker-for-mac](https://github.com/penicillin0/claude-usage-tracker-for-mac) (MIT) and reworked to ride the current [ccusage](https://github.com/ryoppippi/ccusage) CLI. 🎉 Huge thanks to ccusage for the underlying usage analysis.

## Why Burnbar

- 🔥 **Live in the menu bar** — today's cost is always visible, no clicking required
- 📊 **Today + all-time** token counts and cost
- 🌐 **Backend-agnostic** — it reads your local `~/.claude` logs via ccusage, so it works the same whether Claude Code runs on the Anthropic API, **Google Vertex AI**, or **AWS Bedrock**
- 🔒 **Private** — only reads local files; nothing leaves your machine
- ⚡ **Tiny** — a thin Electron tray app over the ccusage CLI

## Requirements

macOS **Monterey (12) or later** — Burnbar runs on Electron 42, whose Chromium base dropped support for Big Sur (11). Ventura (13)+ is the practically tested baseline.

## How it works

Burnbar shells out to the bundled `ccusage` CLI (`ccusage daily --json --mode calculate`), which parses Claude Code's local session logs and prices them per model. Burnbar reads the token and cost totals and renders them in the tray, refreshing on an interval. No accounts, no API keys, no network calls.

## Develop

```bash
pnpm install
pnpm dev      # build + launch
```

Other scripts:

```bash
pnpm build       # compile TypeScript -> dist/
pnpm start       # launch the built app
pnpm check       # oxlint + oxfmt format check
pnpm check:fix   # oxlint --fix + oxfmt write
```

## Build a distributable

```bash
pnpm dist:mac
```

With no credentials set, this produces an **unsigned** `.dmg`/`.zip` — fine for local use, but Gatekeeper will block it on other Macs.

### Signing & notarization

Signing and notarization are driven by environment variables (configured in [electron-builder.config.cjs](electron-builder.config.cjs)), so the build needs no edits to ship. You need a paid **Apple Developer** account and a **Developer ID Application** certificate.

```bash
# Signing — point at your Developer ID cert...
export CSC_LINK="/path/to/DeveloperID.p12"   # or a base64 of the .p12
export CSC_KEY_PASSWORD="cert-password"
# ...or, if the identity is already in your login keychain:
# export CSC_NAME="Developer ID Application: Your Name (TEAMID)"

# Notarization — an app-specific password from appleid.apple.com:
export APPLE_ID="you@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="YOURTEAMID"

pnpm dist:mac
```

When signing vars are present the app is signed; when the notary vars are present it is also notarized and stapled, so it passes Gatekeeper on a second Mac. Omit either set and that step is skipped without failing the build.

## Architecture

```text
src/
├── main.ts     # Electron entry point
├── tray.ts     # menu bar item + menu rendering
├── usage.ts    # spawns the ccusage CLI, parses totals
└── types.ts    # shared types
```

## Disclaimer

Unofficial, third-party tool — **not affiliated with or endorsed by Anthropic**. Displayed usage is computed from local ccusage data and may not match official billing; always confirm spend through your provider (Anthropic / Google Cloud / AWS). Provided "as is", without warranty.

## License

MIT — see [LICENSE](LICENSE). Original work © Nakamura Ayahito; fork modifications © tangentlin.
