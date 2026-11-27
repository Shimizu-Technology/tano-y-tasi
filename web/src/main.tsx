import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import "./styles.css";
import { router } from "./routes";
import { restoreInitialData } from "./api";
import { capturePageview, initAnalytics } from "./lib/analytics";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});
async function main() {
  if (import.meta.env.DEV && import.meta.env.VITE_API_MOCKS === "true") {
    const { startMocks } = await import("./mocks/browser");
    await startMocks();
  }
  restoreInitialData(client);
  // React owns metadata after boot; remove both default and edge-generated tags.
  document.querySelectorAll("[data-tyt-meta]").forEach((element) => element.remove());
  // The first rendered artwork caption uses the same preloaded variable face as body copy.
  await Promise.allSettled(
    ['400 16px', '600 24px', '800 expanded 40px', '900 expanded 24px'].map((style) =>
      document.fonts.load(`${style} "Archivo Variable"`, "GUÅHAN Håfa Adai")
    )
  );
  await document.fonts.ready;
  initAnalytics();
  router.subscribe((state) => {
    capturePageview(state.location.pathname, state.location.search);
  });
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>
  );
}
main().catch(() => {
  document.getElementById("root")!.textContent = "The shop couldn’t load. Please refresh to try again.";
});
