/**
 * AiCreditsController — class core of the AI credits module.
 *
 * Owns balance state, commands, and subscribers. Pure TypeScript: no
 * React, no Next.js, no toast library. Testable in isolation via DI on
 * the `fetcher`, `router`, and `navigate` dependencies.
 *
 * Lifecycle: `new(initial, deps)` → commands → `dispose()`. Pending
 * fetches gated by the `disposed` flag.
 *
 * Error UX split (R&R):
 *   - Universal redirects (`unauthorized`, `no_organization`) → controller
 *     navigates via `navigate` dep (default: `window.location.href`).
 *   - Toast errors (`blocked`, `bad_request`, `internal`) → caller's
 *     responsibility. Use `resolveAiError` from `@/lib/ai/error` on the
 *     same envelope after `consume()` returns `undefined`. Reason:
 *     bespoke toast styling (e.g. the "Top up" CTA on `blocked`) is
 *     page-specific and depends on `billingHref`.
 *
 * React binding lives in `provider.tsx`.
 */

import type { AiActionResult, AiActionData } from "@/lib/ai/server";
import { resolveAiError } from "@/lib/ai/error";
import { refreshAiCredits } from "./actions";

export type AiCreditsState = {
  /** Live balance in cents. `null` = unauth / no org → UI renders "—". */
  cents: number | null;
  /** Gate state (cached). `true` when above floor and entitled. */
  allowed: boolean;
};

export type ConsumeOptions = {
  /** Return-to path after sign-in / onboarding. Defaults to current URL. */
  next?: string;
};

export type AiCreditsDeps = {
  /** Server-action fetcher used by `refresh()`. Injected for tests. */
  fetcher?: () => Promise<AiActionResult<{}>>;
  /** Error router used by `consume()` on failure. Injected for tests. */
  router?: typeof resolveAiError;
  /** Redirect performer. Default: hard nav via `window.location.href`. */
  navigate?: (href: string) => void;
};

export class AiCreditsController {
  private state: AiCreditsState;
  private listeners = new Set<() => void>();
  private disposed = false;
  private inflightRefresh: Promise<void> | null = null;
  private readonly fetcher: () => Promise<AiActionResult<{}>>;
  private readonly router: typeof resolveAiError;
  private readonly navigate: (href: string) => void;

  constructor(initial: AiCreditsState, deps: AiCreditsDeps = {}) {
    this.state = initial;
    this.fetcher = deps.fetcher ?? refreshAiCredits;
    this.router = deps.router ?? resolveAiError;
    this.navigate =
      deps.navigate ??
      ((href: string) => {
        if (typeof window !== "undefined") {
          window.location.href = href;
        }
      });
  }

  // ───── React store contract (stable identity via arrow properties) ─────

  getSnapshot = (): AiCreditsState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  // ───── Commands ─────
  //
  // Arrow-property form (vs. prototype methods) so binding survives
  // destructuring in the React hook layer — `useAiCredits()` returns
  // `{ refresh, consume }` directly without re-binding per render.

  /**
   * Force-sync balance from the server. Concurrent calls share the same
   * in-flight fetch — guards against multiple consumers (chip refresh
   * button, programmatic call) firing duplicate Metronome reads. Ignored
   * after `dispose()`.
   */
  refresh = async (): Promise<void> => {
    if (this.disposed) return;
    if (this.inflightRefresh) return this.inflightRefresh;
    this.inflightRefresh = (async () => {
      try {
        const env = await this.fetcher();
        if (this.disposed) return;
        if (env.success) {
          this.set({ cents: env.data.balanceCents, allowed: true });
        }
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  };

  /**
   * Canonical client-side ingestion of an AI action envelope.
   *
   *   const data = credits.consume(await runChat(input), { next: "/ai" });
   *   if (!data) {
   *     // env was a failure — page handles toast UX with its own
   *     // billingHref / styling using resolveAiError(env, opts).
   *     return;
   *   }
   *   useData(data.reply);
   *
   * Success → folds `balanceCents` into state, returns unwrapped data.
   * Failure with redirect action → navigates, returns `undefined`.
   * Failure with toast action → returns `undefined` (page toasts).
   *
   * No-op after `dispose()` — returns `undefined` without touching
   * state or invoking router/navigate.
   */
  consume = <T>(
    env: AiActionResult<T>,
    opts?: ConsumeOptions
  ): AiActionData<T> | undefined => {
    if (this.disposed) return undefined;
    if (env.success) {
      this.set({ cents: env.data.balanceCents, allowed: true });
      return env.data;
    }
    const action = this.router(env, { next: opts?.next });
    if (action.kind === "redirect") {
      this.navigate(action.href);
    }
    return undefined;
  };

  /**
   * Tear down: gate in-flight fetches, drop subscribers. Idempotent.
   * After this call, `refresh()` and `consume()` are no-ops; state is
   * frozen.
   */
  dispose = (): void => {
    this.disposed = true;
    this.listeners.clear();
  };

  // ───── Internals ─────

  private set(next: AiCreditsState) {
    if (this.disposed) return;
    // Skip notification if neither field actually changed — avoids a
    // re-render storm across every `useAiCredits()` consumer when the
    // server returns the same balance (sub-cent calls round to the
    // same chip / cents value across many actions).
    if (
      next.cents === this.state.cents &&
      next.allowed === this.state.allowed
    ) {
      return;
    }
    this.state = next;
    this.listeners.forEach((l) => l());
  }
}
