import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: "node tests/support/browser-server.js",
    url: "http://127.0.0.1:3100/api/health",
    reuseExistingServer: false,
  },
});
