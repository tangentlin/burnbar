// Bundles the dashboard renderer (browser context) separately from the
// main-process `tsc` build: Chart.js must be bundled for the renderer to import
// it, and the renderer needs the DOM lib that the Node16 main config omits.
// HTML/CSS are copied alongside the bundle into dist/dashboard/.
import { cp, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(root, "src", "dashboard");
const outDir = path.join(root, "dist", "dashboard");

await mkdir(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(srcDir, "renderer.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  outfile: path.join(outDir, "renderer.js"),
  sourcemap: true,
  logLevel: "info",
});

await cp(path.join(srcDir, "index.html"), path.join(outDir, "index.html"));
await cp(path.join(srcDir, "dashboard.css"), path.join(outDir, "dashboard.css"));
