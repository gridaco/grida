// GRIDA-EE: billing — passive credit projection and the existing cache gate.
// GRIDA-SEC-010 / GRIDA-SEC-012 — no provider, cookie, or privileged data dependency.
import { AI_GATE_FLOOR_CENTS } from "./fees";

export namespace credits {
  export type GateInput = Readonly<{
    provisioned: boolean;
    balance_cents: number;
    cache_updated_at: string | null;
    customer_entitled: boolean;
  }>;
  export type Entitlement = Readonly<{
    allowed: boolean;
    reason?: "no_balance" | "below_floor" | "not_provisioned";
    cachedBalanceCents: number;
    cachedAt: string | null;
  }>;
  export type Summary = Readonly<{
    organization: Readonly<{ id: number; name: string; display_name: string }>;
    account_present: boolean;
    state: "not_provisioned" | "uncached" | "cached";
    source: "cache";
    currency: "USD";
    balance_cents: number | null;
    cache_updated_at: string | null;
    billing_gate: Readonly<{
      allowed: boolean;
      reason: "not_provisioned" | "below_floor" | "no_balance" | null;
    }>;
  }>;
  /** One fixed, caller-authorized view query. Null means no visible organization. */
  export type Source = Readonly<{
    read(organizationId: number): Promise<unknown | null>;
  }>;

  export class NotFound extends Error {
    constructor() {
      super("Organization is unavailable.");
      this.name = "CreditsNotFound";
    }
  }
  export class Unavailable extends Error {
    constructor() {
      super("Credit data is unavailable.");
      this.name = "CreditsUnavailable";
    }
  }

  /** The existing gate order; cache age and contract presence add no new rules. */
  export function gate(input: GateInput | null): Entitlement {
    if (!input?.provisioned) {
      return {
        allowed: false,
        reason: "not_provisioned",
        cachedBalanceCents: 0,
        cachedAt: null,
      };
    }
    const cache = {
      cachedBalanceCents: input.balance_cents,
      cachedAt: input.cache_updated_at,
    };
    if (input.balance_cents < AI_GATE_FLOOR_CENTS) {
      return { allowed: false, reason: "below_floor", ...cache };
    }
    if (!input.customer_entitled) {
      return { allowed: false, reason: "no_balance", ...cache };
    }
    return { allowed: true, ...cache };
  }

  /** Cached estimates only; an allowed result is not a GG readiness guarantee. */
  export async function read(
    source: Source,
    organizationId: number
  ): Promise<Summary> {
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0)
      throw new Unavailable();
    const value = await source.read(organizationId);
    if (value === null) throw new NotFound();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Unavailable();
    const row = value as Record<string, unknown>;
    const {
      organization_id,
      organization_name,
      organization_display_name,
      account_present,
      credits_provisioned,
      cached_balance_cents,
      cached_balance_at,
      customer_entitled,
    } = row;
    if (
      organization_id !== organizationId ||
      typeof organization_name !== "string" ||
      !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/.test(organization_name) ||
      typeof organization_display_name !== "string" ||
      typeof account_present !== "boolean" ||
      typeof credits_provisioned !== "boolean" ||
      !(cached_balance_at === null || timestamp(cached_balance_at)) ||
      (account_present
        ? !Number.isSafeInteger(cached_balance_cents) ||
          typeof customer_entitled !== "boolean"
        : credits_provisioned ||
          cached_balance_cents !== null ||
          cached_balance_at !== null ||
          customer_entitled !== null)
    )
      throw new Unavailable();

    const decision = gate(
      account_present
        ? {
            provisioned: credits_provisioned,
            balance_cents: cached_balance_cents as number,
            cache_updated_at: cached_balance_at as string | null,
            customer_entitled: customer_entitled as boolean,
          }
        : null
    );
    const state = !credits_provisioned
      ? "not_provisioned"
      : cached_balance_at === null
        ? "uncached"
        : "cached";
    return {
      organization: {
        id: organizationId,
        name: organization_name,
        display_name: organization_display_name,
      },
      account_present,
      state,
      source: "cache",
      currency: "USD",
      balance_cents:
        state === "cached" ? (cached_balance_cents as number) : null,
      cache_updated_at:
        state === "cached" ? (cached_balance_at as string) : null,
      billing_gate: {
        allowed: decision.allowed,
        reason: decision.reason ?? null,
      },
    };
  }

  function timestamp(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 64) return false;
    const match =
      /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(
        value
      );
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!;
  }
}
