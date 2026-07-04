// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: desktop — see docs/wg/platform/hosted-ai.md
/**
 * Grida Cloud session — the renderer-side token lifecycle owner.
 *
 * The webview cookie session is the only durable credential
 * (GRIDA-SEC-005). This module turns it into hosted-AI access: it mints
 * the short-lived scoped token from the same-origin
 * `POST /desktop/auth/token` route and PUSHES it to the sidecar daemon
 * (`bridge.gg.set_session`), keeping only `{expires_at, organization}`
 * renderer-side — the token itself is never retained here after the push.
 *
 * Contract for callers: `ensureFresh()` before anything that may use the
 * hosted provider (the agent transport pre-send hook, the playgrounds'
 * generate). It is SINGLE-FLIGHT, cheap when fresh (>5 min left = one
 * compare), and **never throws** — hosted AI degrading must never break
 * a BYOK run. Sign-out paths call `clear()`.
 */
import { getDesktopBridge } from "@/lib/desktop/bridge";

export type GridaGatewaySessionState =
  | { kind: "unsupported" } // no bridge.gg (web, or an older binary)
  | { kind: "signed_out" }
  | { kind: "no_organization" }
  | {
      kind: "active";
      expires_at: number;
      organization: { id: number; name: string };
    }
  | { kind: "error" };

/** Re-mint when less than this remains — well inside the 15-min token. */
const REFRESH_SLACK_MS = 5 * 60_000;

let cached: GridaGatewaySessionState | null = null;
let inflight: Promise<GridaGatewaySessionState> | null = null;

function ggBridge() {
  return getDesktopBridge()?.gg ?? null;
}

export function isSupported(): boolean {
  return ggBridge() !== null;
}

/** Synchronous cached state for UI affordances (never triggers IO). */
export function peek(): GridaGatewaySessionState {
  if (cached) return cached;
  return isSupported() ? { kind: "signed_out" } : { kind: "unsupported" };
}

export async function ensureFresh(): Promise<GridaGatewaySessionState> {
  const bridge = ggBridge();
  if (!bridge) return setCached({ kind: "unsupported" });
  if (
    cached?.kind === "active" &&
    cached.expires_at - Date.now() > REFRESH_SLACK_MS
  ) {
    return cached;
  }
  inflight ??= mintAndPush(bridge).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Drop the cache and re-mint (e.g. after a `gg_token_expired` error). */
export async function forceRefresh(): Promise<GridaGatewaySessionState> {
  cached = null;
  return ensureFresh();
}

/** Best-effort daemon clear + cache drop. Called on sign-out; never throws. */
export async function clear(): Promise<void> {
  cached = isSupported() ? { kind: "signed_out" } : { kind: "unsupported" };
  try {
    await ggBridge()?.clear_session();
  } catch {
    // The daemon may be restarting — its in-memory store is gone anyway.
  }
}

async function mintAndPush(
  bridge: NonNullable<ReturnType<typeof ggBridge>>
): Promise<GridaGatewaySessionState> {
  try {
    const res = await fetch("/desktop/auth/token", { method: "POST" });
    if (res.status === 401) {
      await clear();
      return setCached({ kind: "signed_out" });
    }
    if (res.status === 409) {
      await clear();
      return setCached({ kind: "no_organization" });
    }
    if (!res.ok) return setCached({ kind: "error" });
    const data = (await res.json()) as {
      token: string;
      expires_at: string;
      organization: { id: number; name: string };
    };
    const expires_at = Date.parse(data.expires_at);
    await bridge.set_session({
      access_token: data.token,
      expires_at,
      organization: data.organization,
    });
    return setCached({
      kind: "active",
      expires_at,
      organization: data.organization,
    });
  } catch {
    return setCached({ kind: "error" });
  }
}

function setCached(state: GridaGatewaySessionState): GridaGatewaySessionState {
  cached = state;
  return state;
}

// ---------------------------------------------------------------------------
// Error detection — the daemon's typed errors cross Electron's
// contextBridge, which strips custom props; the LITERAL CODE leads the
// message (the `isWriteConflict` idiom). Detect by substring.
// ---------------------------------------------------------------------------

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === "string" ? err : JSON.stringify(err ?? "");
}

export function isGgTokenExpired(err: unknown): boolean {
  return errorText(err).includes("gg_token_expired");
}

export function isGgInsufficientCredits(err: unknown): boolean {
  return errorText(err).includes("insufficient_credits");
}

/** Test-only: reset module singletons between cases. */
export function __unsafe_reset_for_tests(): void {
  cached = null;
  inflight = null;
}
