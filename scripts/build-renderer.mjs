// Bundles the browser-context renderers separately from the main-process `tsc`
// build: Chart.js must be bundled for the dashboard to import it, and both
// renderers need the DOM lib that the Node16 main config omits. Each renderer's
// static assets are copied alongside its bundle into dist/.
import { cp, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const distRoot = path.join(root, "dist");
const assetsRoot = path.join(root, "assets");

const bundle = (entry, outfile) =>
  esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2022"],
    outfile,
    sourcemap: true,
    logLevel: "info",
  });

const renderers = [
  { name: "dashboard", entry: "renderer.ts", assets: ["index.html", "dashboard.css"] },
  { name: "menu-card", entry: "card.ts", assets: ["index.html"] },
  { name: "about", entry: "about.ts", assets: ["index.html", "about.css"] },
];

for (const { name, entry, assets } of renderers) {
  const src = path.join(srcRoot, name);
  const out = path.join(distRoot, name);
  await mkdir(out, { recursive: true });
  await bundle(path.join(src, entry), path.join(out, entry.replace(/\.ts$/, ".js")));
  for (const asset of assets) {
    await cp(path.join(src, asset), path.join(out, asset));
  }
}

// The About page reuses the repo's canonical logo instead of keeping a second copy.
await cp(path.join(assetsRoot, "burnbar.svg"), path.join(distRoot, "about", "burnbar.svg"));
