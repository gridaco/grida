// GRIDA-GG: provider — see docs/wg/platform/hosted-ai.md
/**
 * GRIDA-SEC-006 — Grida Cloud session store (hosted "included" AI).
 *
 * Holds the short-lived, org-scoped AI token the renderer mints from the
 * webview's cookie session (`POST /desktop/auth/token`) and pushes over
 * the daemon perimeter (`/auth/gg/set`). IN MEMORY ONLY, by design:
 * never `auth.json` / `AuthStore` (those are durable credential stores;
 * this token expires in minutes), never disk, never logs. The webview
 * session remains the only durable credential (GRIDA-SEC-005 custodian
 * doctrine) — the daemon never sees a refresh token; the renderer
 * re-mints and re-pushes. Lost on daemon restart, also by design: the
 * renderer's ensure-fresh-before-run re-seeds it.
 */

export type GridaGatewayOrganization = { id: number; name: string };

export type GridaGatewaySession = {
  /** The scoped AI JWT (aud `gg:ai`). Opaque to the daemon. */
  access_token: string;
  /** Expiry, epoch milliseconds (renderer normalizes the mint response). */
  expires_at: number;
  /** Display-only org context (never used for authorization here). */
  organization?: GridaGatewayOrganization;
};

export type GridaGatewaySessionStatus = {
  active: boolean;
  expires_at?: number;
  organization?: GridaGatewayOrganization;
};

/**
 * Reads treat a token expiring within this slack as absent — a
 * resolve-time refusal beats a guaranteed upstream 401 one hop later.
 * The renderer owns proactive refresh at a much wider margin (5 min).
 */
const EXPIRY_SLACK_MS = 30_000;

export class GridaGatewaySessionStore {
  private session: GridaGatewaySession | null = null;

  set(session: GridaGatewaySession): void {
    this.session = session;
  }

  /** Idempotent. Pushed by the renderer on sign-out. */
  clear(): void {
    this.session = null;
  }

  /** Live token, or `null` when absent / expired / within the slack. */
  getAccessToken(now: number = Date.now()): string | null {
    const s = this.session;
    if (!s) return null;
    if (s.expires_at - now <= EXPIRY_SLACK_MS) return null;
    return s.access_token;
  }

  /** Presence + expiry + org for `/auth/gg/status` — NEVER the token. */
  status(now: number = Date.now()): GridaGatewaySessionStatus {
    const s = this.session;
    if (!s || s.expires_at - now <= EXPIRY_SLACK_MS) {
      return { active: false };
    }
    return {
      active: true,
      expires_at: s.expires_at,
      organization: s.organization,
    };
  }
}

/**
 * The single liveness gate shared by the language / image / video
 * resolvers: the Grida Gateway provider resolves only when a base URL is
 * configured AND the store holds a live (unexpired) token. Returns the
 * resolved-endpoint tuple, or `null` when it can't serve. The token is
 * re-read per request inside each factory's fetch — this only gates
 * resolution.
 */
export function liveGgMediaDeps(deps: {
  gg?: GridaGatewaySessionStore;
  gg_base_url?: string;
}): { session: GridaGatewaySessionStore; base_url: string } | null {
  if (!deps.gg || !deps.gg_base_url) return null;
  if (deps.gg.getAccessToken() === null) return null;
  return { session: deps.gg, base_url: deps.gg_base_url };
}
