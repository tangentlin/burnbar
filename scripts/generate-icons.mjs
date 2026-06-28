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
// Rendered with @resvg/resvg-js (npm, prebuilt binaries) so `pnpm icon` works
// after only `pnpm install` — no Homebrew / system rsvg-convert required.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function render(svg, out, size) {
  const outPath = join(root, out);
  mkdirSync(dirname(outPath), { recursive: true });
  const resvg = new Resvg(readFileSync(join(root, svg)), {
    fitTo: { mode: "width", value: size },
  });
  writeFileSync(outPath, resvg.render().asPng());
  console.log(`✓ ${out} (${size}px)`);
}

render("assets/burnbar.svg", "build/icons/icon.png", 1024);
render("assets/burnbar-tray.svg", "assets/icon.png", 44);
