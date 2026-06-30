// Bundles the browser-context renderers separately from the main-process `tsc`
// build: Chart.js must be bundled for the dashboard to import it, and both
// renderers need the DOM lib that the Node16 main config omits. Each renderer's
// HTML (and the dashboard CSS) is copied alongside its bundle into dist/.
import { cp, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = path.join(root, "src");
const distRoot = path.join(root, "dist");

const dashboardSrc = path.join(srcRoot, "dashboard");
const dashboardOut = path.join(distRoot, "dashboard");
const cardSrc = path.join(srcRoot, "menu-card");
const cardOut = path.join(distRoot, "menu-card");

await mkdir(dashboardOut, { recursive: true });
await mkdir(cardOut, { recursive: true });

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

await bundle(path.join(dashboardSrc, "renderer.ts"), path.join(dashboardOut, "renderer.js"));
await bundle(path.join(cardSrc, "card.ts"), path.join(cardOut, "card.js"));

await cp(path.join(dashboardSrc, "index.html"), path.join(dashboardOut, "index.html"));
await cp(path.join(dashboardSrc, "dashboard.css"), path.join(dashboardOut, "dashboard.css"));
await cp(path.join(cardSrc, "index.html"), path.join(cardOut, "index.html"));
