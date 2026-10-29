import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:5181", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    {
      name: "mobile",
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, browserName: "chromium" },
    },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 }, browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5181",
    reuseExistingServer: false,
    env: { VITE_API_MOCKS: "true" },
  },
});
