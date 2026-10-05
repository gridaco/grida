import { describe, expect, it, vi } from "vitest";
import {
  ProductBilling,
  ProductBillingError,
  exactCostMills,
  productDigest,
  type ProductRPC,
} from "./product-billing";
function setup(change: (d: Record<string, unknown>) => void = () => {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const rpc: ProductRPC = async (name, args) => {
    calls.push({ name, args });
    return {
      error: null,
      data:
        name === "platform_billing_owner"
          ? { owner: "infra", epoch: "2" }
          : name === "platform_product_execution_claim"
            ? { created: true, state: "claimed" }
            : name === "platform_product_execution_dispatch"
              ? { dispatch: true, state: "dispatched" }
              : { accepted: true },
    };
  };
  const transport = vi.fn<typeof fetch>(
    async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(init!.body as string),
        now = body.requested_at,
        expiry = new Date(Date.parse(now) + 50000).toISOString();
      const claim = {
        organization_id: body.organization_id,
        product: body.product,
        operation: body.operation,
        model: body.model,
        unit: body.unit,
        policy_version: body.policy_version,
        request_digest: body.request_digest,
        admission_observed_at: now,
        admission_expires_at: expiry,
      };
      const data = {
        id: body.id,
        claim,
        observation_id: body.observation_id,
        allowed: true,
        reason: "",
        account_id: `ba_${"a".repeat(32)}`,
        source_instance: "12345678-1234-1234-1234-123456789012",
        source_epoch: "12345678-1234-1234-1234-123456789012",
        source_version: "1",
        account_observed_at: now,
        lifecycle_observed_at: now,
        commercial_observed_at: now,
        financial_observed_at: now,
        observed_at: now,
        expires_at: expiry,
        balance_cents: 100,
        entitled: true,
        provisioned: true,
      };
      change(data);
      return Response.json(data);
    }
  );
  return {
    calls,
    rpc,
    transport,
    client: new ProductBilling(
      {
        origin: "http://127.0.0.1:56740",
        keyId: "source",
        token: "a".repeat(43),
        development: true,
      },
      rpc,
      transport
    ),
  };
}
const input = {
  organizationId: 123,
  feature: "chat",
  model_id: "fixture/model",
  transactionId: "execution-1",
  requestDigest: productDigest({ prompt: "private" }),
};
describe("product admission boundary", () => {
  it("retains claim before dispatch and commits exact completion locally", async () => {
    const f = setup();
    const execution = await f.client.begin(input);
    const receipt = await f.client.complete(execution, "0.000000000000000001", {
      usage: "opaque",
    });
    expect(f.calls.map((c) => c.name)).toEqual([
      "platform_billing_owner",
      "platform_product_execution_claim",
      "platform_product_execution_dispatch",
      "platform_product_execution_receipt",
    ]);
    expect(receipt.quantity).toBe("0.000000000000000001");
    expect(receipt.unit).toBe("cost_mills");
    expect(receipt).not.toHaveProperty("request_digest");
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["nonce", (d: Record<string, unknown>) => (d.observation_id = "different")],
    [
      "expired",
      (d: Record<string, unknown>) =>
        (d.expires_at = new Date(Date.now() - 1).toISOString()),
    ],
    [
      "renewed cache",
      (d: Record<string, unknown>) =>
        (d.financial_observed_at = new Date(Date.now() - 61000).toISOString()),
    ],
    [
      "extended deadline",
      (d: Record<string, unknown>) =>
        (d.expires_at = new Date(Date.now() + 61000).toISOString()),
    ],
    [
      "wrong org",
      (d: Record<string, unknown>) =>
        ((d.claim as Record<string, unknown>).organization_id = "999"),
    ],
    [
      "missing component",
      (d: Record<string, unknown>) => delete d.lifecycle_observed_at,
    ],
    [
      "forged source",
      (d: Record<string, unknown>) => (d.source_epoch = "unknown"),
    ],
  ] as const)("rejects %s before local dispatch", async (_name, change) => {
    const f = setup(change);
    await expect(f.client.begin(input)).rejects.toBeInstanceOf(
      ProductBillingError
    );
    expect(f.calls).toHaveLength(1);
  });
  it("denied display observation is not execution authority", async () => {
    const f = setup((d) => {
      d.allowed = false;
      d.reason = "below_floor";
    });
    expect((await f.client.entitlement(123)).allowed).toBe(false);
    await expect(f.client.begin(input)).rejects.toMatchObject({
      code: "blocked",
    });
    expect(f.calls.every((c) => c.name === "platform_billing_owner")).toBe(
      true
    );
  });
  it("does not grant dispatch on duplicate local custody", async () => {
    const f = setup();
    const rpc: ProductRPC = async (name, args) =>
      name === "platform_product_execution_claim"
        ? { data: { created: false, state: "dispatched" }, error: null }
        : f.rpc(name, args);
    const client = new ProductBilling(
      {
        origin: "http://127.0.0.1:56740",
        keyId: "source",
        token: "a".repeat(43),
        development: true,
      },
      rpc,
      f.transport
    );
    await expect(client.begin(input)).rejects.toMatchObject({
      code: "execution_already_dispatched",
    });
    expect(
      f.calls.some((c) => c.name === "platform_product_execution_dispatch")
    ).toBe(false);
  });
  it("source custody failure is surfaced rather than swallowed", async () => {
    const f = setup();
    const execution = await f.client.begin(input);
    const client = new ProductBilling(
      {
        origin: "http://127.0.0.1:56740",
        keyId: "source",
        token: "a".repeat(43),
        development: true,
      },
      async () => ({ data: null, error: { code: "outage" } }),
      f.transport
    );
    await expect(client.complete(execution, "1", {})).rejects.toBeInstanceOf(
      ProductBillingError
    );
    expect(f.transport).toHaveBeenCalledTimes(1);
  });
  it("denies retired source owner before HTTP", async () => {
    const f = setup();
    const client = new ProductBilling(
      {
        origin: "http://127.0.0.1:56740",
        keyId: "source",
        token: "a".repeat(43),
        development: true,
      },
      async () => ({ data: { owner: "grida", epoch: "1" }, error: null }),
      f.transport
    );
    await expect(client.begin(input)).rejects.toBeInstanceOf(
      ProductBillingError
    );
    expect(f.transport).not.toHaveBeenCalled();
  });
});
describe("native exact quantities", () => {
  it.each([
    [1e-18, "0.000000000000000001"],
    [1.25, "1.25"],
    ["9223372036854775807", "9223372036854775807"],
    [0, "0"],
  ])("retains %s", (v, s) => expect(exactCostMills(v)).toBe(s));
  it.each([
    NaN,
    Infinity,
    -1,
    1e-19,
    "1.0000000000000000001",
    "01",
    "9223372036854775807.1",
  ])("rejects ambiguous/out-of-range %s", (v) =>
    expect(() => exactCostMills(v)).toThrow("invalid_cost")
  );
  it("hashes equivalent input key order and never exposes input", () =>
    expect(productDigest({ b: 1, a: { d: 2, c: 3 } })).toBe(
      productDigest({ a: { c: 3, d: 2 }, b: 1 })
    ));
});
