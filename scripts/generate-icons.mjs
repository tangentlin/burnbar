// Regenerate Burnbar's PNG icons from the committed SVG sources.
//
// Sources (committed, source of truth):
//   assets/burnbar.svg       full-color app icon
//   assets/burnbar-tray.svg  monochrome menu-bar mark (reference only; see below)
//
// Outputs:
//   build/icons/icon.png     1024px app icon for electron-builder packaging
//
// The menu-bar tray PNGs (assets/icon.png @1x + assets/icon@2x.png @2x) are
// hand-authored and committed directly — they are optically tuned per size, which a
// single SVG render can't reproduce — so they are NOT regenerated here. See
// docs/modules/icon-pipeline.md; assets/burnbar-tray.svg is kept as a design reference.
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
// Note: the tray mark (assets/icon.png @1x + assets/icon@2x.png @2x) is hand-authored
// and committed, not generated — see the header comment and docs/modules/icon-pipeline.md.
