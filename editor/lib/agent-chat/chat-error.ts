/**
 * `chatError` — classification + truthful copy for the desktop agent chat's
 * error banner.
 *
 * The banner used to print `error.message` raw, which laundered failures:
 * a torn SSE read surfaces the browser's literal "network error" /
 * "Failed to fetch" (the AI SDK's disconnect heuristic passes it through
 * verbatim), and a client reducer death surfaces as "No tool invocation
 * found for tool call ID …" — both useless and misleading to the person
 * reading them (the 2026-07-10 approval-resume incident shipped exactly
 * that). Classification here is what lets the panels say what actually
 * happened AND drive the owner-gated self-heal (`resume-recovery`) whenever
 * the server state is intact and the client view is the only casualty.
 *
 * Headless by doctrine (no React, no transport, no bridge imports) so the
 * table is provable in a plain Node test. GG detection reuses the shared
 * bridge-free predicates (`@/lib/desktop/gg-errors` — the GRIDA-GG wire
 * contract in one place; `gg-session.ts` re-exports the same functions).
 */

import {
  isGgTokenExpired,
  isGgInsufficientCredits,
} from "@/lib/desktop/gg-errors";

export namespace chatError {
  export type Kind =
    /** GRIDA-GG: the hosted-AI token lapsed mid-run; a re-mint fixes it. */
    | "gg-token-expired"
    /** GRIDA-GG: the org's AI credit balance is exhausted. */
    | "gg-insufficient-credits"
    /** The stream's transport died (torn SSE / fetch failure). The server
     * run is unaffected — a disconnect is never an abort. Recoverable. */
    | "disconnect"
    /** The AI-SDK client reducer rejected the stream's state (e.g. "No tool
     * invocation found"): the VIEW desynced; the server state is intact.
     * Recoverable. */
    | "stream-state"
    /** A stale client tried to start a new turn while the durable transcript
     * is waiting on approval/user input. The server rejected before
     * persistence, so restoring the authoritative transcript repairs the
     * optimistic local tail. */
    | "human-input-pending"
    /** Another window won the session's atomic turn admission. The losing
     * request was rejected before persistence, so its optimistic text tail
     * can move to the durable queue under the same message id. */
    | "run-in-flight"
    | "unknown";

  export function classify(err: unknown): Kind {
    if (isGgTokenExpired(err)) return "gg-token-expired";
    if (isGgInsufficientCredits(err)) return "gg-insufficient-credits";
    if (isHumanInputPending(err)) return "human-input-pending";
    if (isRunInFlight(err)) return "run-in-flight";
    if (isNamed(err, "AI_UIMessageStreamError")) return "stream-state";
    const message = errorText(err);
    // Mirror the AI SDK's own disconnect heuristic (a TypeError whose
    // message mentions fetch/network is the browser's torn-connection
    // shape) — plus WebKit's "Load failed" wording.
    if (err instanceof TypeError) {
      const m = message.toLowerCase();
      if (
        m.includes("fetch") ||
        m.includes("network") ||
        m.includes("load failed")
      ) {
        return "disconnect";
      }
    }
    return "unknown";
  }

  /** True for the kinds the owner-gated self-heal can repair (the server
   * has the durable truth; the client view is the only casualty). A type
   * guard so callers can pass the narrowed kind straight into
   * `StreamAttachOwner.noteStreamError`. */
  export function recoverable(
    kind: Kind
  ): kind is
    | "disconnect"
    | "stream-state"
    | "human-input-pending"
    | "run-in-flight" {
    return (
      kind === "disconnect" ||
      kind === "stream-state" ||
      kind === "human-input-pending" ||
      kind === "run-in-flight"
    );
  }

  /** Truthful, person-readable copy. The GG lines move verbatim from the
   * agent pane's banner (single source now — the sidebar gains them too). */
  export function describe(err: unknown): string {
    switch (classify(err)) {
      case "gg-token-expired":
        return "Your Grida session needed a refresh — try sending again.";
      case "gg-insufficient-credits":
        return "Your organization is out of AI credits.";
      case "disconnect":
        return "The connection to the agent was interrupted.";
      case "stream-state":
        return "The live view lost sync with the agent.";
      case "human-input-pending":
        return "The agent is waiting for your response before it can continue.";
      case "run-in-flight":
        return "Another turn started first. Your message is waiting to be queued.";
      case "unknown":
        return errorText(err) || "Something went wrong.";
    }
  }

  function errorText(err: unknown): string {
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message;
    return "";
  }

  function isNamed(err: unknown, name: string): boolean {
    return (
      typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name?: unknown }).name === name
    );
  }

  function isHumanInputPending(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { code?: unknown; message?: unknown };
    if (
      e.code === "human-input-pending" ||
      e.code === "approval-resume-with-new-message"
    ) {
      return true;
    }
    return (
      typeof e.message === "string" &&
      (e.message.includes("human-input-pending") ||
        e.message.includes("a human-input block"))
    );
  }

  function isRunInFlight(err: unknown): boolean {
    if (!err || typeof err !== "object") return false;
    const e = err as { code?: unknown; message?: unknown };
    if (e.code === "run_in_flight") return true;
    return (
      typeof e.message === "string" &&
      (e.message.includes("run_in_flight") ||
        e.message.includes("run-in-flight") ||
        e.message.includes("run already in flight"))
    );
  }
}
