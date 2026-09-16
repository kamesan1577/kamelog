import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/visual",
  retries: 0,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:6006" },
  webServer: {
    command: "storybook dev --ci --port 6006",
    url: "http://127.0.0.1:6006",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
