import { setupWorker } from "msw/browser";
import { handlers, configureMocks } from "./handlers";
import type { DropState } from "../types";
export async function startMocks() {
  const query = new URLSearchParams(location.search).get("mockDrop");
  const valid = ["upcoming", "live", "sold_out", "closed"];
  if (query && valid.includes(query)) {
    if (sessionStorage.getItem("tyt-mock-state") !== query) sessionStorage.removeItem("tyt-mock-db");
    sessionStorage.setItem("tyt-mock-state", query);
  }
  const state = (sessionStorage.getItem("tyt-mock-state") || "upcoming") as DropState;
  let database;
  try {
    database = JSON.parse(sessionStorage.getItem("tyt-mock-db") || "null") ?? undefined;
  } catch {
    sessionStorage.removeItem("tyt-mock-db");
  }
  configureMocks({ state, database, save: (db) => sessionStorage.setItem("tyt-mock-db", JSON.stringify(db)) });
  const worker = setupWorker(...handlers);
  await worker.start({ onUnhandledRequest: "bypass", quiet: true });
}
