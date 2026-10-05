import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import {
  handleProductReceipts,
  type ProductReceiptRPC,
} from "./product-receipts";
const token = "a".repeat(43);
const key = {
  id: "receipts",
  verifier_sha256: createHash("sha256").update(token).digest("hex"),
  environment: "local",
  audience: "grida.product-receipts",
  not_before: new Date(Date.now() - 1000).toISOString(),
  not_after: new Date(Date.now() + 3600000).toISOString(),
  revoked: false,
};
const config = { environment: "local", keys: [key] };
function request(
  body: unknown,
  headers: Record<string, string> = {},
  path = "receipts"
) {
  return new Request(`http://127.0.0.1/internal/platform/products/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "x-grida-workload-key-id": "receipts",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
it("uses only the fixed receipt RPC after dedicated workload verification", async () => {
  const rpc = vi.fn<ProductReceiptRPC>(async () => ({
    data: { events: [] },
    error: null,
  }));
  expect(
    (
      await handleProductReceipts(
        request({ limit: 100 }),
        "receipts",
        config,
        rpc
      )
    ).status
  ).toBe(200);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("platform_product_usage_page", {
    batch_limit: 100,
  });
});
it("canonical source credential cannot read product custody", async () => {
  const rpc = vi.fn<ProductReceiptRPC>();
  expect(
    (
      await handleProductReceipts(
        request({ limit: 100 }),
        "receipts",
        { ...config, keys: [{ ...key, audience: "platform.canonical" }] },
        rpc
      )
    ).status
  ).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 1, producer: "foreign" },
  { event_ids: ["invalid"] },
  null,
])("rejects malformed or widening input %j", async (body) => {
  const rpc = vi.fn<ProductReceiptRPC>();
  expect(
    (await handleProductReceipts(request(body), "receipts", config, rpc)).status
  ).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it.each(["cookie", "origin", "x-grida-account-token", "x-grida-native-token"])(
  "rejects mixed %s authority",
  async (header) => {
    const rpc = vi.fn<ProductReceiptRPC>();
    expect(
      (
        await handleProductReceipts(
          request({ limit: 100 }, { [header]: "unexpected" }),
          "receipts",
          config,
          rpc
        )
      ).status
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  }
);
it("ACK failures remain retryable and never fabricate success", async () => {
  const rpc = vi.fn<ProductReceiptRPC>(async () => ({
    data: null,
    error: { code: "outage" },
  }));
  const body = { event_ids: ["12345678-1234-1234-1234-123456789012"] };
  expect(
    (
      await handleProductReceipts(
        request(body, {}, "receipts/ack"),
        "receipts/ack",
        config,
        rpc
      )
    ).status
  ).toBe(503);
  expect(rpc).toHaveBeenCalledExactlyOnceWith(
    "platform_product_usage_ack",
    body
  );
});
