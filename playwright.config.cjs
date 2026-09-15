"use strict";

const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "test/e2e",
  timeout: 60_000,
  expect: { timeout: 30_000 },
  use: { browserName: "chromium", headless: true },
  webServer: [
    {
      command: "yarn start:production",
      url: "http://127.0.0.1:3001/",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000
    },
    {
      command: "node test/e2e/fixture-server.cjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: !process.env.CI,
      timeout: 10_000
    }
  ]
});
