// Regenerate Burnbar's PNG icons from the committed SVG sources.
//
// Sources (committed, source of truth):
//   assets/burnbar.svg       full-color app icon
//   assets/burnbar-tray.svg  monochrome menu-bar template mark
//
// Outputs:
//   build/icons/icon.png     1024px app icon for electron-builder packaging
//   assets/icon.png          44px menu-bar tray template (loaded by src/tray.ts)
//
// Uses rsvg-convert (librsvg) — install with `brew install librsvg`.
// Tracked as tech debt: replace with a portable npm renderer so a clean
// checkout / CI can regenerate without a system dependency.

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function render(svg, out, size) {
  const outPath = join(root, out);
  mkdirSync(dirname(outPath), { recursive: true });
  execFileSync("rsvg-convert", [
    "-w",
    String(size),
    "-h",
    String(size),
    join(root, svg),
    "-o",
    outPath,
  ]);
  console.log(`✓ ${out} (${size}px)`);
}

render("assets/burnbar.svg", "build/icons/icon.png", 1024);
render("assets/burnbar-tray.svg", "assets/icon.png", 44);
