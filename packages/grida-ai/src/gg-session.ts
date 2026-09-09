// GRIDA-SEC-006 — memory-only scoped credential custody.
// GRIDA-GG: token — no account session, refresh, mint, or persistence.
import { gridaGatewayOrigin } from "./gg";
/** The host supplies and clears short-lived GG grants. A lost process loses its grant. */
export type GridaGatewayOrganization = { id: number; name: string };

export type GridaGatewaySession = {
  /** The scoped AI JWT (aud `gg:ai`). Opaque to this store. */
  access_token: string;
  /** Expiry, epoch milliseconds (the host normalizes the mint response). */
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
 * The host owns refresh timing; this store never mints or refreshes.
 */
const EXPIRY_SLACK_MS = 30_000;

/** Trusted in-process capability. Return only a live scoped GG token, never an account credential. */
export type GgTokenSource = { getAccessToken(now?: number): string | null };

export class GridaGatewaySessionStore {
  #session: GridaGatewaySession | null = null;

  set(session: GridaGatewaySession): void {
    const { access_token, expires_at, organization } = session;
    if (
      typeof access_token !== "string" ||
      !access_token.trim() ||
      !Number.isSafeInteger(expires_at)
    ) {
      this.#session = null;
      return;
    }
    const id = organization?.id;
    const name = organization?.name;
    const safeOrganization =
      Number.isSafeInteger(id) && id! > 0 && typeof name === "string"
        ? { id: id!, name }
        : undefined;
    this.#session = {
      access_token,
      expires_at,
      ...(safeOrganization ? { organization: safeOrganization } : {}),
    };
  }

  /** Idempotent. The host calls this on sign-out. */
  clear(): void {
    this.#session = null;
  }

  /** Live token, or `null` when absent / expired / within the slack. */
  getAccessToken(now: number = Date.now()): string | null {
    const s = this.#session;
    if (!s) return null;
    if (s.expires_at - now <= EXPIRY_SLACK_MS) return null;
    return s.access_token;
  }

  /** Presence + expiry + org for host status — NEVER the token. */
  status(now: number = Date.now()): GridaGatewaySessionStatus {
    const s = this.#session;
    if (!s || s.expires_at - now <= EXPIRY_SLACK_MS) {
      return { active: false };
    }
    return {
      active: true,
      expires_at: s.expires_at,
      organization: s.organization
        ? { id: s.organization.id, name: s.organization.name }
        : undefined,
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
  gg?: GgTokenSource;
  gg_base_url?: string;
}): { session: GgTokenSource; base_url: string } | null {
  if (!deps.gg || !deps.gg_base_url) return null;
  const base_url = gridaGatewayOrigin(deps.gg_base_url);
  if (deps.gg.getAccessToken() === null) return null;
  return { session: deps.gg, base_url };
}
