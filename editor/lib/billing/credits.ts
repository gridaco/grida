// Public cached-credit response shape shared by the Platform consumers.
// This DTO has no source database or financial provider dependency.
export namespace credits {
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
}
