import { contextBridge, ipcRenderer } from "electron";
import type { BurnbarBridge, SeriesRequest } from "./types.js";

// ESM preload (compiled to preload.mjs) — Electron 42 loads it because the
// window runs with sandbox:false + contextIsolation:true. The renderer gets
// read-only channels and no Node access. Keep this file self-contained: only
// the `electron` import survives compilation (the type import is erased), so
// the preload never depends on other dist modules resolving at load time.
//
// Channel ids mirror the constants in ipc.ts; keep the two in sync.
const bridge: BurnbarBridge = {
  getSeries: (request: SeriesRequest) => ipcRenderer.invoke("archive:get-series", request),
  exportData: () => ipcRenderer.invoke("archive:export"),
};

contextBridge.exposeInMainWorld("burnbar", bridge);
