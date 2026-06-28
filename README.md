# 🔥 Burnbar

A macOS menu bar app that shows your **Claude Code token burn and cost** at a glance — today's spend sits right in the menu bar, with all-time totals one click away.

> Forked from [penicillin0/claude-usage-tracker-for-mac](https://github.com/penicillin0/claude-usage-tracker-for-mac) (MIT) and reworked to ride the current [ccusage](https://github.com/ryoppippi/ccusage) CLI. 🎉 Huge thanks to ccusage for the underlying usage analysis.

## Why Burnbar

- 🔥 **Live in the menu bar** — today's cost is always visible, no clicking required
- 📊 **Today + all-time** token counts and cost
- 🌐 **Backend-agnostic** — it reads your local `~/.claude` logs via ccusage, so it works the same whether Claude Code runs on the Anthropic API, **Google Vertex AI**, or **AWS Bedrock**
- 🔒 **Private** — only reads local files; nothing leaves your machine
- ⚡ **Tiny** — a thin Electron tray app over the ccusage CLI

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
pnpm check       # Biome lint + format check
```

## Build a distributable

```bash
pnpm dist:mac
```

> Signing and notarization are **off** by default (`build.mac.identity: null`). To distribute to other Macs, set your own Apple Developer identity and re-enable notarization in `package.json` → `build.mac`.

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
