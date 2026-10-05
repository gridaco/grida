// GRIDA-EE: billing — no-env consumer contract and external HTTP failures.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  billingDestination,
  billingOwner,
  BillingConsumerError,
  cachedCredits,
  consoleBillingUrl,
  platformBilling,
} from "./billing-consumer";
const env = {
  GRIDA_BILLING_OWNER: "infra",
  GRIDA_PLATFORM_BILLING_ORIGIN: "https://platform.example.test",
  GRIDA_PLATFORM_CONSOLE_ORIGIN: "https://console.example.test",
  GRIDA_PLATFORM_SSR_KEY_ID: "grida-ssr-local",
  GRIDA_PLATFORM_SSR_TOKEN: "x".repeat(43),
};
const bearer = "user.access.token";
const projection = {
  organization_id: "7",
  account_present: true,
  state: "cached",
  source: "cache",
  currency: "USD",
  balance_cents: 1000,
  cache_updated_at: "2026-10-06T00:00:00Z",
  billing_gate: { allowed: true, reason: null },
};
afterEach(() => vi.unstubAllEnvs());
describe("lazy consumer configuration and typed destinations", () => {
  it("needs no billing configuration for default product startup", () => {
    expect(billingOwner({})).toBe("grida");
    expect(billingOwner({ GRIDA_BILLING_OWNER: "infra" })).toBe("infra");
    expect(() => billingOwner({ GRIDA_BILLING_OWNER: "other" })).toThrow(
      BillingConsumerError
    );
  });
  it("requires explicit origins and scoped workload credentials on use", () => {
    expect(() => platformBilling({})).toThrow(BillingConsumerError);
    for (const key of [
      "GRIDA_PLATFORM_BILLING_ORIGIN",
      "GRIDA_PLATFORM_SSR_KEY_ID",
      "GRIDA_PLATFORM_SSR_TOKEN",
    ] as const)
      expect(() => platformBilling({ ...env, [key]: "" })).toThrow(
        BillingConsumerError
      );
    expect(consoleBillingUrl(7, { section: "billing" }, env)).toBe(
      "https://console.example.test/organizations/7/billing"
    );
    expect(billingDestination(7, { section: "upgrade" })).toBe(
      "/organizations/7/billing/upgrade"
    );
    expect(
      billingDestination(7, {
        section: "purchase",
        purchaseId: "11111111-1111-4111-8111-111111111111",
      })
    ).toBe(
      "/organizations/7/billing/purchases/11111111-1111-4111-8111-111111111111"
    );
  });
  it.each([
    "https://console.example.test/",
    "https://console.example.test/path",
    "https://user:password@console.example.test",
    "https://console.example.test?next=foreign",
    "http://example.test",
    "//evil.test",
    "javascript:alert(1)",
  ])("rejects non-origin configuration %s", (origin) =>
    expect(() =>
      consoleBillingUrl(
        7,
        { section: "billing" },
        { ...env, GRIDA_PLATFORM_CONSOLE_ORIGIN: origin }
      )
    ).toThrow(BillingConsumerError)
  );
  it("permits explicit development loopback and rejects production loopback", () => {
    const local = {
      ...env,
      GRIDA_PLATFORM_ALLOW_LOCAL: "1",
      GRIDA_PLATFORM_CONSOLE_ORIGIN: "http://127.0.0.1:56842",
      NODE_ENV: "development",
    };
    expect(consoleBillingUrl(7, { section: "billing" }, local)).toContain(
      "127.0.0.1:56842/organizations/7/billing"
    );
    expect(() =>
      consoleBillingUrl(
        7,
        { section: "billing" },
        { ...local, NODE_ENV: "production" }
      )
    ).toThrow(BillingConsumerError);
  });
  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, NaN])(
    "rejects invalid organization %s",
    (org) =>
      expect(() => billingDestination(org, { section: "billing" })).toThrow(
        BillingConsumerError
      )
  );
  it.each(["../billing", "", "11111111-1111-4111-8111-111111111111?next=x"])(
    "rejects invalid resource %s",
    (purchaseId) =>
      expect(() =>
        billingDestination(7, { section: "purchase", purchaseId })
      ).toThrow(BillingConsumerError)
  );
});
describe("fixed platform request envelope", () => {
  it.each(["browser", "native"] as const)(
    "preserves distinct %s authority and sends no browser cookies",
    async (family) => {
      const transport = vi.fn<typeof fetch>(async () =>
        Response.json(projection)
      );
      expect(
        await platformBilling(env, transport).credits(7, bearer, family)
      ).toEqual(projection);
      const [url, init] = transport.mock.calls[0];
      expect(url).toBe(
        "https://platform.example.test/platform/v1/billing/organizations/7/credits"
      );
      expect(init).toMatchObject({
        method: "GET",
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
      });
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${env.GRIDA_PLATFORM_SSR_TOKEN}`
      );
      expect(new Headers(init?.headers).get("x-grida-workload-key-id")).toBe(
        env.GRIDA_PLATFORM_SSR_KEY_ID
      );
      expect(
        new Headers(init?.headers).get(
          family === "native" ? "x-grida-native-token" : "x-grida-account-token"
        )
      ).toBe(bearer);
      expect(
        new Headers(init?.headers).get(
          family === "native" ? "x-grida-account-token" : "x-grida-native-token"
        )
      ).toBeNull();
      expect(new Headers(init?.headers).has("cookie")).toBe(false);
      expect(init?.body).toBeUndefined();
    }
  );
  it("refresh is a bounded browser command with no user-controlled payload", async () => {
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ provisioned: true })
    );
    await platformBilling(env, transport).refresh(7, bearer, 50);
    expect(transport.mock.calls[0][0]).toBe(
      "https://platform.example.test/platform/v1/billing/organizations/7/credits/refresh"
    );
    expect(transport.mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: "{}",
    });
  });
  it.each([401, 403, 404, 429, 500, 503])(
    "does not fall back after HTTP%s",
    async (status) => {
      const transport = vi.fn<typeof fetch>(
        async () => new Response("private provider credentials", { status })
      );
      await expect(
        platformBilling(env, transport).credits(7, bearer)
      ).rejects.toMatchObject({
        code:
          status === 401
            ? "unauthorized"
            : [403, 404].includes(status)
              ? "forbidden"
              : "unavailable",
        message: "Billing is unavailable.",
      });
      expect(transport).toHaveBeenCalledTimes(1);
    }
  );
  it("bounds provider failure and rejects oversized or non-JSON output", async () => {
    for (const response of [
      new Response("private error"),
      new Response("x".repeat(65537), {
        headers: { "content-type": "application/json" },
      }),
      Response.json({ ...projection, organization_id: "8" }),
    ]) {
      await expect(
        platformBilling(env, async () => response).credits(7, bearer)
      ).rejects.toThrow(BillingConsumerError);
    }
    const aborting = vi.fn<typeof fetch>(
      async (_url, init) =>
        await new Promise((_resolve, reject) =>
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("timeout")),
            { once: true }
          )
        )
    );
    await expect(
      platformBilling(env, aborting).refresh(7, bearer, 10)
    ).rejects.toThrow(BillingConsumerError);
    expect(aborting).toHaveBeenCalledTimes(1);
  });
  it("validates plan identity and never substitutes free for unavailable state", async () => {
    expect(
      await platformBilling(env, async () =>
        Response.json({
          organization_id: "7",
          plan: "custom",
          managed_contract: true,
          account_present: true,
        })
      ).summary(7, bearer)
    ).toEqual({
      organization_id: "7",
      plan: "custom",
      managed_contract: true,
      account_present: true,
    });
    for (const body of [
      {},
      {
        organization_id: "8",
        plan: "free",
        managed_contract: false,
        account_present: false,
      },
      {
        organization_id: "7",
        plan: "custom",
        managed_contract: false,
        account_present: true,
      },
    ])
      await expect(
        platformBilling(env, async () => Response.json(body)).summary(7, bearer)
      ).rejects.toThrow(BillingConsumerError);
  });
});
describe("passive DTO semantics", () => {
  it("preserves unknown versus recorded zero/negative amounts", () => {
    for (const state of ["not_provisioned", "uncached"]) {
      const body = {
        ...projection,
        state,
        balance_cents: null,
        cache_updated_at: null,
        billing_gate: {
          allowed: false,
          reason:
            state === "not_provisioned" ? "not_provisioned" : "below_floor",
        },
      };
      expect(cachedCredits(body, 7).balance_cents).toBeNull();
    }
    for (const balance_cents of [0, -27])
      expect(
        cachedCredits(
          {
            ...projection,
            balance_cents,
            billing_gate: { allowed: false, reason: "below_floor" },
          },
          7
        ).balance_cents
      ).toBe(balance_cents);
  });
  it.each([
    { balance_cents: "1000" },
    { balance_cents: null },
    { cache_updated_at: null },
    { currency: "KRW" },
    { organization_id: "07" },
    { account_present: false },
    { billing_gate: { allowed: true, reason: "below_floor" } },
  ])("rejects malformed projection %j", (change) =>
    expect(() => cachedCredits({ ...projection, ...change }, 7)).toThrow(
      BillingConsumerError
    )
  );
});
