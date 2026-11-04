import { setupWorker } from "msw/browser";
import { handlers, configureMocks } from "./handlers";
import { setMockAnnounced, setMockSalesOpen } from "./data";
import { configureAdminMocks } from "./adminHandlers";
import type { DropState } from "../types";
export async function startMocks() {
  const params = new URLSearchParams(location.search);
  const adminMode = params.get("mockAdmin");
  if (adminMode && ["ok", "expired", "forbidden", "unavailable"].includes(adminMode)) sessionStorage.setItem("tyt-mock-admin-mode", adminMode);
  // mockUpload=fail-once refuses the next image PUT, unconfigured answers uploads with 503, offline drops the connection.
  configureAdminMocks(sessionStorage.getItem("tyt-mock-admin-mode") || "ok", params.get("mockUpload") ?? "ok");
  const requestedCount = params.get("mockCore");
  if (import.meta.env.DEV && requestedCount && ["1", "2", "3"].includes(requestedCount))
    sessionStorage.setItem("tyt-mock-core", requestedCount);
  const coreCount = import.meta.env.DEV ? Number(sessionStorage.getItem("tyt-mock-core") || 1) : 1;
  const query = params.get("mockDrop");
  const valid = ["coming_soon", "upcoming", "live", "sold_out", "closed"];
  if (query && valid.includes(query)) {
    if (sessionStorage.getItem("tyt-mock-state") !== query) sessionStorage.removeItem("tyt-mock-db");
    sessionStorage.setItem("tyt-mock-state", query);
  }
  const storeMode = params.get("mockStore");
  if (storeMode === "closed" || storeMode === "open") sessionStorage.setItem("tyt-mock-store", storeMode);
  setMockSalesOpen(sessionStorage.getItem("tyt-mock-store") !== "closed");
  const stored = sessionStorage.getItem("tyt-mock-state") || "upcoming";
  setMockAnnounced(stored !== "coming_soon");
  const state = (stored === "coming_soon" ? "upcoming" : stored) as DropState;
  let database;
  try {
    database = JSON.parse(sessionStorage.getItem("tyt-mock-db") || "null") ?? undefined;
  } catch {
    sessionStorage.removeItem("tyt-mock-db");
  }
  const failure = params.get("mockPayment");
  configureMocks({
    state,
    coreCount,
    database,
    paymentFailures: failure === "same_key" || failure === "new_checkout" ? [failure] : [],
    save: (db) => sessionStorage.setItem("tyt-mock-db", JSON.stringify(db)),
  });
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}
