import { defineConfig } from "@playwright/test";
const port = Number(process.env.E2E_PORT || 5181);
export default defineConfig({
  testDir: "./tests",
  // The puzzle home runs against its own build: playwright.puzzle.config.ts.
  testIgnore: "puzzle-home.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, browserName: "chromium" },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { VITE_API_MOCKS: "true", VITE_ADMIN_TEST_AUTH: "true" },
  },
});
