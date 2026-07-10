import type { Preview } from "@storybook/html-vite";

// Each story paints its own light/dark menu-bar backgrounds into the panel, so we
// don't depend on the backgrounds addon — keep global parameters minimal.
const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    controls: { hideNoControlsWarning: true },
  },
};

export default preview;
