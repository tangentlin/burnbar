// Rewrites the line following the <!-- LATEST_DMG_LINK --> marker in
// README.md to point at a specific release's dmg asset. Invoked by
// .github/workflows/update-readme-download-link.yml after a stable release
// is published; TAG/DMG_URL come from that workflow's environment.
import { readFileSync, writeFileSync } from "node:fs";

const README_PATH = "README.md";
const MARKER = "<!-- LATEST_DMG_LINK -->";

const tag = process.env.TAG;
const dmgUrl = process.env.DMG_URL;
if (!tag || !dmgUrl) {
  throw new Error("TAG and DMG_URL environment variables are required");
}

const version = tag.replace(/^v/, "");
const newLine = `[**⬇️ Download for Mac (Apple Silicon) — v${version}**](${dmgUrl}) · [All releases](https://github.com/tangentlin/burnbar/releases/latest)`;

const readme = readFileSync(README_PATH, "utf8");
const markerIndex = readme.indexOf(MARKER);
if (markerIndex === -1) {
  throw new Error(`${README_PATH} is missing the ${MARKER} marker`);
}

const lineStart = markerIndex + MARKER.length + 1; // skip marker + its newline
const lineEnd = readme.indexOf("\n", lineStart);
writeFileSync(README_PATH, readme.slice(0, lineStart) + newLine + readme.slice(lineEnd));
