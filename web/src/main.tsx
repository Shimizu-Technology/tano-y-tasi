import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { restoreInitialData } from "./api";
import "./styles.css";
import "./looks/shared.css";
import "./looks/look-1.css";
import "./looks/look-2.css";
import "./looks/look-3.css";
import "./looks/look-4.css";
import "./looks/look-5.css";
import { initializeLook } from "./looks/look";
const initialLook = initializeLook();
router.subscribe(({ location }) => initializeLook(location));
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
  // Looks 1, 4 and 5 set headings in Fraunces; load it before the first render so they don't swap from the fallback.
  if (initialLook === "1" || initialLook === "4" || initialLook === "5") {
    await Promise.allSettled([document.fonts.load('550 48px "Fraunces Variable"', "A piece of home. Håfa Adai Tåno Tåsi")]);
  }
  await document.fonts.ready;
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
