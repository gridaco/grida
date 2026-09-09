// GRIDA-EE: billing — passive cached-credit policy.
// GRIDA-SEC-010 / GRIDA-SEC-012 — authenticated data stays bounded and explicit.
import { describe, expect, it, vi } from "vitest";
import { credits } from "./credits";

const timestamp = "2026-09-06T12:34:56.123456+00:00";
const row = {
  organization_id: 42,
  organization_name: "studio",
  organization_display_name: "Studio",
  account_present: true,
  credits_provisioned: true,
  cached_balance_cents: 25,
  cached_balance_at: timestamp,
  customer_entitled: true,
};
const source = (value: unknown): credits.Source => ({
  read: vi.fn<credits.Source["read"]>().mockResolvedValue(value),
});
const gateInput = {
  provisioned: true,
  balance_cents: 25,
  cache_updated_at: timestamp,
  customer_entitled: true,
};

describe("credits.gate", () => {
  it.each([null, { ...gateInput, provisioned: false }])(
    "checks provisioning before every other gate",
    (value) => {
      expect(credits.gate(value)).toEqual({
        allowed: false,
        reason: "not_provisioned",
        cachedBalanceCents: 0,
        cachedAt: null,
      });
    }
  );

  it.each([-100, 0, 24])(
    "blocks balance %i before the entitlement flag",
    (balance) => {
      expect(
        credits.gate({
          ...gateInput,
          balance_cents: balance,
          customer_entitled: false,
        })
      ).toEqual({
        allowed: false,
        reason: "below_floor",
        cachedBalanceCents: balance,
        cachedAt: timestamp,
      });
    }
  );

  it("blocks a false entitlement at the floor", () => {
    expect(credits.gate({ ...gateInput, customer_entitled: false })).toEqual({
      allowed: false,
      reason: "no_balance",
      cachedBalanceCents: 25,
      cachedAt: timestamp,
    });
  });

  it.each([25, 26, Number.MAX_SAFE_INTEGER])(
    "allows balance %i with entitlement",
    (balance) => {
      expect(credits.gate({ ...gateInput, balance_cents: balance })).toEqual({
        allowed: true,
        cachedBalanceCents: balance,
        cachedAt: timestamp,
      });
    }
  );

  it.each([null, "2000-01-01T00:00:00Z"])(
    "adds no cache freshness requirement",
    (cache_updated_at) => {
      expect(credits.gate({ ...gateInput, cache_updated_at }).allowed).toBe(
        true
      );
    }
  );
});

describe("credits.read", () => {
  it("projects only safe fields from one fixed organization", async () => {
    const data = source({
      ...row,
      metronome_customer_id: "private",
      stripe_customer_id: "private",
    });
    expect(await credits.read(data, 42)).toEqual({
      organization: { id: 42, name: "studio", display_name: "Studio" },
      account_present: true,
      state: "cached",
      source: "cache",
      currency: "USD",
      balance_cents: 25,
      cache_updated_at: timestamp,
      billing_gate: { allowed: true, reason: null },
    });
    expect(data.read).toHaveBeenCalledExactlyOnceWith(42);
  });

  it("distinguishes a missing account from denied organization access", async () => {
    expect(
      await credits.read(
        source({
          ...row,
          account_present: false,
          credits_provisioned: false,
          cached_balance_cents: null,
          cached_balance_at: null,
          customer_entitled: null,
        }),
        42
      )
    ).toMatchObject({
      account_present: false,
      state: "not_provisioned",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    });
    await expect(credits.read(source(null), 42)).rejects.toBeInstanceOf(
      credits.NotFound
    );
  });

  it("does not display a default or stale unprovisioned balance as observed credits", async () => {
    expect(
      await credits.read(source({ ...row, credits_provisioned: false }), 42)
    ).toMatchObject({
      account_present: true,
      state: "not_provisioned",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: false, reason: "not_provisioned" },
    });
  });

  it("masks an unobserved cache while preserving the existing gate decision", async () => {
    expect(
      await credits.read(source({ ...row, cached_balance_at: null }), 42)
    ).toMatchObject({
      state: "uncached",
      balance_cents: null,
      cache_updated_at: null,
      billing_gate: { allowed: true, reason: null },
    });
  });

  it.each([0, -123])(
    "preserves observed balance %i without clamping or defaults",
    async (balance) => {
      expect(
        await credits.read(
          source({ ...row, cached_balance_cents: balance }),
          42
        )
      ).toMatchObject({
        state: "cached",
        balance_cents: balance,
        cache_updated_at: timestamp,
        billing_gate: { allowed: false, reason: "below_floor" },
      });
    }
  );

  it.each([
    "2024-02-29T23:59:59Z",
    "2026-09-06T12:34:56+09:00",
    "2026-09-06T12:34:56.123456789Z",
  ])("accepts valid timestamp %s", async (value) => {
    expect(
      (await credits.read(source({ ...row, cached_balance_at: value }), 42))
        .cache_updated_at
    ).toBe(value);
  });

  it.each([
    undefined,
    [],
    [row],
    "row",
    0,
    { ...row, organization_id: 43 },
    { ...row, organization_id: "42" },
    { ...row, organization_name: "invalid/name" },
    { ...row, organization_display_name: null },
    { ...row, account_present: "true" },
    { ...row, credits_provisioned: null },
    { ...row, account_present: false },
    { ...row, cached_balance_cents: null },
    { ...row, cached_balance_cents: Number.MAX_SAFE_INTEGER + 1 },
    { ...row, cached_balance_cents: 0.1 },
    { ...row, cached_balance_cents: NaN },
    { ...row, customer_entitled: null },
    { ...row, cached_balance_at: "2026-09-06" },
    { ...row, cached_balance_at: "2026-09-06T12:34:56" },
    { ...row, cached_balance_at: "2026-02-30T12:34:56Z" },
    { ...row, cached_balance_at: "2026-09-06T24:00:00Z" },
    { ...row, cached_balance_at: "2026-09-06T12:34:56+24:00" },
  ])("rejects malformed or inconsistent row %#", async (value) => {
    await expect(credits.read(source(value), 42)).rejects.toBeInstanceOf(
      credits.Unavailable
    );
  });

  it.each([0, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid org %s before reading",
    async (id) => {
      const data = source(row);
      await expect(credits.read(data, id)).rejects.toBeInstanceOf(
        credits.Unavailable
      );
      expect(data.read).not.toHaveBeenCalled();
    }
  );

  it("never replaces source errors with a successful missing/empty result", async () => {
    const failure = new Error("synthetic source failure");
    await expect(
      credits.read(
        {
          read: async () => {
            throw failure;
          },
        },
        42
      )
    ).rejects.toBe(failure);
  });
});
