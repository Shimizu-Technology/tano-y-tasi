import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// The puzzle home is a build of its own (VITE_HOME_EXPERIENCE=puzzle), so its browser tests run
// against their own dev server on another port.
const port = Number(process.env.E2E_PUZZLE_PORT || 5183);
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "puzzle-home.spec.ts",
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { VITE_API_MOCKS: "true", VITE_HOME_EXPERIENCE: "puzzle", E2E_PORT: String(port) },
  },
});
