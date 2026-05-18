"use client";

/**
 * React binding for `AiCreditsController`.
 *
 * `<AiCredits.Provider>` constructs the controller exactly once per
 * mount and disposes it on unmount. `useAiCredits()` reads via
 * `useSyncExternalStore` — concurrent-mode safe, no tearing.
 *
 * All business logic lives on the controller (see `controller.ts`).
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { AiCreditsController, type AiCreditsState } from "./controller";
import * as format from "./format";

const Ctx = createContext<AiCreditsController | null>(null);

export type AiCreditsProviderProps = {
  /** Server-preloaded initial state (cents, allowed). */
  initial: AiCreditsState;
  children: React.ReactNode;
};

export function Provider({ initial, children }: AiCreditsProviderProps) {
  const ref = useRef<AiCreditsController | null>(null);
  if (ref.current === null) {
    ref.current = new AiCreditsController(initial);
  }
  useEffect(() => {
    return () => {
      ref.current?.dispose();
    };
  }, []);
  return <Ctx.Provider value={ref.current}>{children}</Ctx.Provider>;
}

/**
 * Hook accessor for the credits controller's reactive state.
 *
 *   const credits = useAiCredits();
 *   credits.cents             // number | null
 *   credits.allowed           // boolean
 *   credits.formatted         // "$26.0" | null
 *   credits.formattedExact    // "$25.9921" | null
 *   credits.byok              // a BYOK key is set server-side
 *   credits.refresh()         // pull live
 *   credits.consume(env, opts)// fold envelope; redirects auto-routed
 *
 * `byok` reports only that a key is configured. BYOK bypasses billing
 * for the AI-SDK text/chat path ONLY — Replicate-backed surfaces
 * (audio/image) still bill, so `cents`/`allowed` stay truthful and
 * those surfaces must NOT treat `byok` as "unlimited". Only the AI
 * chat surface acts on this flag. GRIDA-SEC-003.
 */
export function useAiCredits() {
  const ctrl = useContext(Ctx);
  if (!ctrl) {
    throw new Error(
      "useAiCredits() must be called inside <AiCredits.Provider>"
    );
  }
  const state = useSyncExternalStore(
    ctrl.subscribe,
    ctrl.getSnapshot,
    ctrl.getSnapshot
  );
  // `refresh` and `consume` are arrow properties on the controller
  // (see controller.ts) — pass them through unbound; identity is
  // stable across renders since they're set once in the constructor.
  return {
    cents: state.cents,
    allowed: state.allowed,
    formatted: format.chip(state.cents),
    formattedExact: format.exact(state.cents),
    byok: state.byok,
    refresh: ctrl.refresh,
    consume: ctrl.consume,
  };
}
