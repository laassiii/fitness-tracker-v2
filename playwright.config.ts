import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5173",
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_BROWSER_EXECUTABLE
      ? { executablePath: process.env.PW_BROWSER_EXECUTABLE }
      : {},
  },
  webServer: [
    {
      command: "npm run dev -w apps/api -- --ip 127.0.0.1",
      url: "http://127.0.0.1:8787/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
    {
      command: "npm run dev -w apps/web -- --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    },
  ],
});
