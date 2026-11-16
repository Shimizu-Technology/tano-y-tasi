import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  const home = env.VITE_HOME_EXPERIENCE || process.env.VITE_HOME_EXPERIENCE || "classic";
  if (!["classic", "puzzle"].includes(home)) throw new Error(`VITE_HOME_EXPERIENCE must be "classic" or "puzzle", not "${home}".`);
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Netlify names the deploy context. Branch deploys and deploy previews, like the puzzle
        // home preview, stay out of search; production never gets this file (check-production.mjs).
        name: "noindex-previews",
        apply: "build",
        generateBundle() {
          if (process.env.CONTEXT && process.env.CONTEXT !== "production")
            this.emitFile({ type: "asset", fileName: "_headers", source: "/*\n  X-Robots-Tag: noindex\n" });
        },
      },
      {
        // Tells the edge function which home this build serves, so it preloads the right picture.
        name: "home-experience-marker",
        transformIndexHtml: (html) => (home === "puzzle" ? html.replace("</head>", '    <meta name="tyt-home" content="puzzle" />\n  </head>') : html),
      },
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
    // The home page is chosen here, not at runtime, so each build carries only its own home and
    // the puzzle home paints without waiting for a second script. Types follow tsconfig's "paths".
    resolve: { alias: { "@home-page": fileURLToPath(new URL(`./src/pages/home.${home}.ts`, import.meta.url)) } },
    // Its encoder finds its .wasm next to the module, which dependency pre-bundling would break.
    optimizeDeps: { exclude: ["@jsquash/webp"] },
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
