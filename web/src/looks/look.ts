import { useSyncExternalStore } from "react";

export type Look = "1" | "2" | "3";
export const LOOK_STORAGE_KEY = "tyt-preview-look";
export const lookNames: Record<Look, string> = { "1": "Island Supply", "2": "Sun & Hill", "3": "Refined" };
const validLook = (value: string | null): value is Look => value === "1" || value === "2" || value === "3";
const listeners = new Set<() => void>();
let active: Look | null = null;

// Called by the external entry module before React and on client-side navigation.
// Admin never consumes preview parameters or inherits storefront palette tokens.
export function initializeLook(location: Pick<Location, "pathname" | "search"> = window.location) {
  let next: Look | null = null;
  if (!/^\/admin(?:\/|$)/.test(location.pathname)) {
    const requested = new URLSearchParams(location.search).get("look");
    let saved: string | null = null;
    let storageAvailable = true;
    try { saved = sessionStorage.getItem(LOOK_STORAGE_KEY); } catch { storageAvailable = false; }
    next = requested === "off" ? null : validLook(requested) ? requested : validLook(saved) ? saved : storageAvailable ? null : active;
    if (requested === "off" || validLook(requested)) {
      try {
        if (next) sessionStorage.setItem(LOOK_STORAGE_KEY, next);
        else sessionStorage.removeItem(LOOK_STORAGE_KEY);
      } catch { /* The explicit URL still previews when storage is unavailable. */ }
    }
  }
  if (next) document.documentElement.dataset.look = next;
  else delete document.documentElement.dataset.look;
  if (active !== next) {
    active = next;
    listeners.forEach((listener) => listener());
  }
  return next;
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useLook = () => useSyncExternalStore(subscribe, () => active, () => null);
