import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import "./styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: true } },
});
async function main() {
  if (import.meta.env.VITE_API_MOCKS === "true") {
    const { startMocks } = await import("./mocks/browser");
    await startMocks();
  }
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
