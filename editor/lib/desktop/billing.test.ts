// GRIDA-EE: billing — see ee-billing
/**
 * Desktop credits summary seam.
 *
 * Pins: the seam is a passive read (never provisions, refresh is
 * best-effort and bounded), unprovisioned orgs surface `balance_cents:
 * null` (render "—", never "$0.00"), the manage path is built from the
 * org SLUG, and every degraded dependency (Metronome down/slow, missing
 * subscription row, missing org row) still yields a `ready` summary from
 * cached data.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveSessionOrganization =
  vi.fn<(user_id: string) => Promise<{ id: number; name: string } | null>>();
vi.mock("@/lib/auth/organization", () => ({
  resolveSessionOrganization: (user_id: string) =>
    resolveSessionOrganization(user_id),
}));

type Entitlement = {
  allowed: boolean;
  reason?: "no_balance" | "below_floor" | "not_provisioned";
  cachedBalanceCents: number;
  cachedAt: string | null;
};
const getEntitlement = vi.fn<(orgId: number) => Promise<Entitlement>>();
const refreshBalance = vi.fn<(orgId: number) => Promise<{ cents: number }>>();
vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: (orgId: number) => getEntitlement(orgId),
  refreshBalance: (orgId: number) => refreshBalance(orgId),
}));

type TableRow = { data: unknown; error: unknown };
let tables: Record<string, TableRow>;
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => tables[table] ?? { data: null, error: null },
        }),
      }),
    }),
  }),
}));

import { getDesktopBillingSummary } from "./billing";

const ORG = { id: 7, name: "acme", display_name: "Acme Inc." };

const ENTITLED: Entitlement = {
  allowed: true,
  cachedBalanceCents: 512,
  cachedAt: "2026-07-03T00:00:00Z",
};
const NOT_PROVISIONED: Entitlement = {
  allowed: false,
  reason: "not_provisioned",
  cachedBalanceCents: 0,
  cachedAt: null,
};
const BELOW_FLOOR: Entitlement = {
  allowed: false,
  reason: "below_floor",
  cachedBalanceCents: 12,
  cachedAt: "2026-07-03T00:00:00Z",
};

beforeEach(() => {
  resolveSessionOrganization.mockReset();
  getEntitlement.mockReset();
  refreshBalance.mockReset();
  resolveSessionOrganization.mockResolvedValue({ id: ORG.id, name: ORG.name });
  refreshBalance.mockResolvedValue({ cents: 512 });
  tables = {
    organization: { data: { display_name: ORG.display_name }, error: null },
    v_billing_subscription: { data: { plan: "pro" }, error: null },
  };
});

describe("getDesktopBillingSummary", () => {
  it("short-circuits to no_organization without touching billing", async () => {
    resolveSessionOrganization.mockResolvedValue(null);
    const summary = await getDesktopBillingSummary("user-1");
    expect(summary).toEqual({ state: "no_organization" });
    expect(getEntitlement).not.toHaveBeenCalled();
    expect(refreshBalance).not.toHaveBeenCalled();
  });

  it("unprovisioned org: skips refresh, surfaces null balance (not $0.00)", async () => {
    getEntitlement.mockResolvedValue(NOT_PROVISIONED);
    const summary = await getDesktopBillingSummary("user-1");
    expect(refreshBalance).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      state: "ready",
      credits: {
        balance_cents: null,
        entitled: false,
        blocked_reason: "not_provisioned",
      },
      // Built from the SLUG — display_name would 404 the web route.
      manage_path: "/organizations/acme/settings/billing",
    });
  });

  it("happy path: refreshes once and reports the post-refresh entitlement", async () => {
    getEntitlement
      .mockResolvedValueOnce(ENTITLED)
      .mockResolvedValueOnce({ ...ENTITLED, cachedBalanceCents: 700 });
    const summary = await getDesktopBillingSummary("user-1");
    expect(refreshBalance).toHaveBeenCalledTimes(1);
    expect(refreshBalance).toHaveBeenCalledWith(ORG.id);
    expect(getEntitlement).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      state: "ready",
      organization: ORG,
      plan: "pro",
      credits: { balance_cents: 700, entitled: true, blocked_reason: null },
    });
  });

  it("falls back to cached entitlement when the live refresh fails", async () => {
    getEntitlement.mockResolvedValue(ENTITLED);
    refreshBalance.mockRejectedValue(
      new Error("METRONOME_API_TOKEN is required")
    );
    const summary = await getDesktopBillingSummary("user-1");
    expect(getEntitlement).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      state: "ready",
      credits: { balance_cents: 512, entitled: true },
    });
  });

  it("falls back to cached entitlement when the live refresh hangs past the timeout", async () => {
    getEntitlement.mockResolvedValue(ENTITLED);
    refreshBalance.mockReturnValue(new Promise(() => {})); // never settles
    const summary = await getDesktopBillingSummary("user-1", {
      liveRefreshTimeoutMs: 10,
    });
    expect(getEntitlement).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({
      state: "ready",
      credits: { balance_cents: 512, entitled: true },
    });
  });

  it("maps a missing or unknown subscription row to the free plan", async () => {
    getEntitlement.mockResolvedValue(ENTITLED);
    tables.v_billing_subscription = { data: null, error: null };
    expect((await getDesktopBillingSummary("user-1")) as never).toMatchObject({
      plan: "free",
    });
    tables.v_billing_subscription = {
      data: { plan: "enterprise" },
      error: null,
    };
    expect((await getDesktopBillingSummary("user-1")) as never).toMatchObject({
      plan: "free",
    });
  });

  it("falls back to the slug when the org display row is unavailable", async () => {
    getEntitlement.mockResolvedValue(ENTITLED);
    tables.organization = { data: null, error: null };
    const summary = await getDesktopBillingSummary("user-1");
    expect(summary).toMatchObject({
      organization: { id: ORG.id, name: "acme", display_name: "acme" },
    });
  });

  it("passes below-floor balances through with the blocked reason", async () => {
    getEntitlement.mockResolvedValue(BELOW_FLOOR);
    const summary = await getDesktopBillingSummary("user-1");
    expect(summary).toMatchObject({
      credits: {
        balance_cents: 12,
        entitled: false,
        blocked_reason: "below_floor",
      },
    });
  });
});
