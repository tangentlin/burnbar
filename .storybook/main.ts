import type { StorybookConfig } from "@storybook/html-vite";

// Framework-free Storybook (HTML + Vite) matching the repo's no-framework stance.
// Stories live outside src/ so the Node16 `tsc` build/typecheck never touches them;
// Vite bundles them (and resolves the pure src/ modules they import) on its own.
const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.ts"],
  addons: [],
  framework: {
    name: "@storybook/html-vite",
    options: {},
  },
  // Burnbar is privacy-first (nothing leaves the device); opt the dev tooling out
  // of Storybook's anonymous usage telemetry to match that stance.
  core: {
    disableTelemetry: true,
  },
  // Serve assets/ at the web root so the badge story can load the committed tray
  // template (assets/icon@2x.png) as the base image for the real compositor.
  staticDirs: ["../assets"],
};

export default config;
