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
 * Self-harnessing view returned by `useAiCredits()`.
 *
 * Discriminated on `mode`. The `byok` variant **omits** `cents` /
 * `allowed` / `formatted` on purpose: when a server-side BYOK key is
 * set the balance is meaningless, so any consumer that wants to render
 * a balance is forced by the compiler to first handle `mode === "byok"`
 * and pick its own label (the label is per-call-site — there is no
 * global glyph). `refresh`/`consume` exist in both variants so envelope
 * folding still works (under BYOK they no-op the display).
 */
export type AiCreditsView =
  | {
      mode: "billed";
      cents: number | null;
      allowed: boolean;
      formatted: string | null;
      formattedExact: string | null;
      refresh: AiCreditsController["refresh"];
      consume: AiCreditsController["consume"];
    }
  | {
      mode: "byok";
      refresh: AiCreditsController["refresh"];
      consume: AiCreditsController["consume"];
    };

/**
 * Hook accessor for the credits controller's reactive state.
 *
 *   const credits = useAiCredits();
 *   if (credits.mode === "byok") return <YourByokLabel />;
 *   credits.cents             // number | null   (billed only)
 *   credits.allowed           // boolean         (billed only)
 *   credits.formatted         // "$26.0" | null  (billed only)
 *   credits.formattedExact    // "$25.9921" | null
 *   credits.refresh()         // pull live
 *   credits.consume(env, opts)// fold envelope; redirects auto-routed
 */
export function useAiCredits(): AiCreditsView {
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
  if (state.byok) {
    return { mode: "byok", refresh: ctrl.refresh, consume: ctrl.consume };
  }
  return {
    mode: "billed",
    cents: state.cents,
    allowed: state.allowed,
    formatted: format.chip(state.cents),
    formattedExact: format.exact(state.cents),
    refresh: ctrl.refresh,
    consume: ctrl.consume,
  };
}
