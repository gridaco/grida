// GRIDA-EE: billing — published source paths retain exact sign-in/org/resource continuation.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: { id: "user-a" } as { id: string } | null,
  org: { id: 7, name: "acme" } as { id: number; name: string } | null,
  error: null as unknown,
  queries: [] as string[],
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("../supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => {
      state.queries.push(table);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.org, error: state.error }),
          }),
        }),
      };
    },
  }),
}));
import { billingHandoff, sourceBillingPath } from "./billing-handoff";
const purchase = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "infra");
  vi.stubEnv("GRIDA_PLATFORM_CONSOLE_ORIGIN", "https://console.example.test");
  state.user = { id: "user-a" };
  state.org = { id: 7, name: "acme" };
  state.error = null;
  state.queries = [];
});
afterEach(() => vi.unstubAllEnvs());
it.each(["billing", "upgrade"] as const)(
  "hands off %s by canonical org, not a project or guessed organization",
  async (section) => {
    await expect(billingHandoff("acme", section)).rejects.toThrow(
      `redirect:https://console.example.test/organizations/7/billing${section === "upgrade" ? "/upgrade" : ""}`
    );
    expect(state.queries).toEqual(["organization"]);
  }
);
it("preserves signed-out upgrade continuation before source sign-in", async () => {
  state.user = null;
  await expect(billingHandoff("acme", "upgrade")).rejects.toThrow(
    `redirect:/sign-in?next=${encodeURIComponent("/organizations/acme/settings/billing/upgrade")}`
  );
  expect(state.queries).toEqual([]);
});
it("retains an exact purchase resource across sign-in and console handoff", async () => {
  state.user = null;
  const search = { purchase_id: purchase, intent: "topup" };
  await expect(billingHandoff("acme", "return", search)).rejects.toThrow(
    `redirect:/sign-in?next=${encodeURIComponent(`/organizations/acme/settings/billing/return?purchase_id=${purchase}&intent=topup`)}`
  );
  state.user = { id: "user-a" };
  await expect(billingHandoff("acme", "return", search)).rejects.toThrow(
    `redirect:https://console.example.test/organizations/7/billing/purchases/${purchase}`
  );
});
it("released intent-only return preserves uncertainty and does not select a purchase", async () => {
  expect(await billingHandoff("acme", "return", { intent: "topup" })).toEqual({
    url: "https://console.example.test/organizations/7/billing",
    name: "acme",
  });
  expect(state.queries).toEqual(["organization"]);
});
it("unknown or invisible explicit organization never selects another", async () => {
  state.org = null;
  await expect(billingHandoff("acme", "billing")).rejects.toThrow("not_found");
  expect(state.queries).toEqual(["organization"]);
});
it("source failure stays failure and never becomes a different account", async () => {
  state.error = { message: "private database failure" };
  await expect(billingHandoff("acme", "billing")).rejects.toThrow(
    "Billing is unavailable."
  );
});
it.each([
  { purchase_id: "../foreign" },
  { purchase_id: [purchase, purchase] },
  { intent: ["topup", "subscribe"] },
])("refuses ambiguous/unsafe return target %j", async (search) => {
  await expect(billingHandoff("acme", "return", search)).rejects.toThrow(
    "not_found"
  );
  expect(state.queries).toEqual([]);
});
it("rejects injected org navigation and does not forward arbitrary URLs", () => {
  expect(() => sourceBillingPath("acme/../../foreign", "billing")).toThrow(
    "Billing is unavailable."
  );
  expect(sourceBillingPath("acme", "billing")).toBe(
    "/organizations/acme/settings/billing"
  );
});
