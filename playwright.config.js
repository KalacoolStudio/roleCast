import { defineConfig } from "@playwright/test";
const port = Number(process.env.ROLECAST_TEST_PORT || 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid ROLECAST_TEST_PORT");
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure" },
  webServer: {
    command: "node tests/support/browser-server.js",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
  },
});
