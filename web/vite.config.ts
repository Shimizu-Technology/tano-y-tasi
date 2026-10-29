import { readFileSync } from "node:fs";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  if (command === "build") {
    for (const flag of ["VITE_API_MOCKS", "VITE_SIMULATED_PAYMENTS", "VITE_ADMIN_TEST_AUTH"]) {
      if (env[flag] === "true")
        throw new Error(`${flag} is development-only and cannot be enabled in a production build.`);
    }
  }
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "dev-only-msw-worker",
        configureServer(server) {
          server.middlewares.use("/mockServiceWorker.js", (_request, response) => {
            response.setHeader("Content-Type", "application/javascript");
            response.end(readFileSync(new URL("./mocks/mockServiceWorker.js", import.meta.url)));
          });
        },
      },
    ],
    server: { port: Number(process.env.E2E_PORT || 5181), strictPort: true },
    preview: { port: 4181, strictPort: true },
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
      include: ["src/**/*.test.{ts,tsx}", "netlify/**/*.test.ts"],
      restoreMocks: true,
    },
  };
});
