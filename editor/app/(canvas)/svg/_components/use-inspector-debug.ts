"use client";

import { useSyncExternalStore } from "react";

// Unity-style "Debug mode" for the SVG inspector demo: off by default,
// reveals extra info (provenance carrier badges) when toggled. A tiny
// module-level store — the demo is a singleton page, so a global flag is
// simpler than threading context/props through every inspector row.

const STORAGE_KEY = "grida-svg-inspector-debug";

let value = false;
const listeners = new Set<() => void>();

// Lazily read localStorage on first client access. SSR-safe: `window` is
// absent on the server, so the initial snapshot stays `false` and matches
// `getServerSnapshot`.
let hydrated = false;
function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  // `localStorage` access throws in storage-restricted contexts (private
  // mode, sandboxed iframes, disabled cookies) — fall back to the default.
  try {
    value = window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    value = false;
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  hydrate();
  return value;
}

export function setInspectorDebug(next: boolean): void {
  // Hydrate first so the equality check compares against persisted state,
  // not the pre-hydration default (else a `set(false)` before any read
  // no-ops against a stale `value` and never persists).
  hydrate();
  if (next === value) return;
  value = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // Persistence unavailable; keep in-memory behavior.
    }
  }
  listeners.forEach((cb) => cb());
}

export function toggleInspectorDebug(): void {
  setInspectorDebug(!getSnapshot());
}

/** Reactive read of the global inspector debug flag. */
export function useInspectorDebug(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
