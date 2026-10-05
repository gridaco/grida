// GRIDA-EE: billing — Desktop DTO parity with the activated infra owner.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  org: { id: 7, name: "acme" } as { id: number; name: string } | null,
  tables: [] as string[],
  oldRead: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  oldRefresh: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@/lib/auth/organization", () => ({
  resolveSessionOrganization: async () => state.org,
}));
vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: state.oldRead,
  refreshBalance: state.oldRefresh,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "browser.access.token" } },
      }),
    },
    from: (table: string) => {
      state.tables.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { display_name: "Acme" },
              error: null,
            }),
          }),
        }),
      };
    },
  }),
}));
import { getDesktopBillingSummary } from "./billing";
const cached = {
  organization_id: "7",
  account_present: true,
  state: "cached",
  source: "cache",
  currency: "USD",
  balance_cents: 1000,
  cache_updated_at: "2026-10-06T00:00:00Z",
  billing_gate: { allowed: true, reason: null },
};
const summary = {
  organization_id: "7",
  account_present: true,
  plan: "custom",
  managed_contract: true,
};
beforeEach(() => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "infra");
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "https://platform.example.test");
  vi.stubEnv("GRIDA_PLATFORM_SSR_KEY_ID", "grida-ssr");
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "x".repeat(43));
  state.org = { id: 7, name: "acme" };
  state.tables = [];
  state.oldRead.mockReset();
  state.oldRefresh.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("preserves ready organization/plan/credits/manage_path without source financial queries", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      calls.push(url);
      expect(new Headers(init?.headers).get("x-grida-account-token")).toBe(
        "browser.access.token"
      );
      expect(new Headers(init?.headers).has("x-grida-native-token")).toBe(
        false
      );
      if (url.endsWith("/summary")) return Response.json(summary);
      if (url.endsWith("/credits/refresh"))
        return new Response(null, { status: 403 });
      return Response.json(cached);
    })
  );
  expect(await getDesktopBillingSummary("user-a")).toEqual({
    state: "ready",
    organization: { id: 7, name: "acme", display_name: "Acme" },
    plan: "custom",
    credits: {
      balance_cents: 1000,
      entitled: true,
      blocked_reason: null,
      as_of: cached.cache_updated_at,
    },
    manage_path: "/organizations/acme/settings/billing",
  });
  expect(state.tables).toEqual(["organization"]);
  expect(state.oldRead).not.toHaveBeenCalled();
  expect(state.oldRefresh).not.toHaveBeenCalled();
  expect(calls.filter((url) => url.endsWith("/credits/refresh"))).toHaveLength(
    1
  );
});
it("unprovisioned balance remains null and does not request provisioning or refresh", async () => {
  const transport = vi.fn<typeof fetch>(async (input) =>
    String(input).endsWith("/summary")
      ? Response.json({ ...summary, plan: "free", managed_contract: false })
      : Response.json({
          ...cached,
          state: "not_provisioned",
          balance_cents: null,
          cache_updated_at: null,
          billing_gate: { allowed: false, reason: "not_provisioned" },
        })
  );
  vi.stubGlobal("fetch", transport);
  expect(await getDesktopBillingSummary("user-a")).toMatchObject({
    state: "ready",
    plan: "free",
    credits: {
      balance_cents: null,
      entitled: false,
      blocked_reason: "not_provisioned",
      as_of: null,
    },
  });
  expect(transport).toHaveBeenCalledTimes(2);
});
it("bounded unavailable refresh retains previously observed cached timestamp", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/summary")) return Response.json(summary);
      if (url.endsWith("/credits/refresh"))
        return await new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true }
          )
        );
      return Response.json(cached);
    })
  );
  expect(
    await getDesktopBillingSummary("user-a", { liveRefreshTimeoutMs: 10 })
  ).toMatchObject({
    credits: { balance_cents: 1000, as_of: cached.cache_updated_at },
  });
});
it("no organization needs no billing setup and starts no HTTP call", async () => {
  state.org = null;
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "");
  const transport = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", transport);
  expect(await getDesktopBillingSummary("user-a")).toEqual({
    state: "no_organization",
  });
  expect(transport).not.toHaveBeenCalled();
  expect(state.tables).toEqual([]);
});
it("failed plan or credit read does not fall back to source financial authority", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async () => new Response("private", { status: 503 }))
  );
  await expect(getDesktopBillingSummary("user-a")).rejects.toThrow(
    "Billing is unavailable."
  );
  expect(state.oldRead).not.toHaveBeenCalled();
  expect(state.oldRefresh).not.toHaveBeenCalled();
});
