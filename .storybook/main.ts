import type { StorybookConfig } from "@storybook/nextjs-vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const config: StorybookConfig = {
  stories: ["../components/design-system/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-vitest"],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  viteFinal: async (config) => {
    config.resolve ??= {};
    config.resolve.alias = { ...(config.resolve.alias ?? {}), "@": root };
    return config;
  },
};

export default config;
