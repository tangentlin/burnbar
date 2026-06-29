import { defineConfig } from "vitest/config";

// Unit tests target the pure, framework-free logic (merge/backfill/normalize/
// derive/atomic IO). Node environment; no Electron, no DOM. ccusage is mocked
// via the injected runner + JSON fixtures, so no live CLI runs here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
