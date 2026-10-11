// Product billing configuration stays lazy and fails closed without a source writer.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<unknown>>());
vi.mock("../supabase/server", () => ({ service_role: { workspace: { rpc } } }));
import { platformProductBilling } from "./product-consumer";
import { ProductBillingError } from "./product-billing";
beforeEach(() => {
  rpc.mockReset();
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "https://platform.example.test");
  vi.stubEnv("GRIDA_PLATFORM_USAGE_KEY_ID", "grida-product");
  vi.stubEnv("GRIDA_PLATFORM_USAGE_TOKEN", "x".repeat(43));
});
afterEach(() => vi.unstubAllEnvs());
it.each([
  "GRIDA_PLATFORM_BILLING_ORIGIN",
  "GRIDA_PLATFORM_USAGE_KEY_ID",
  "GRIDA_PLATFORM_USAGE_TOKEN",
])("fails closed without %s before custody or provider work", (name) => {
  vi.stubEnv(name, "");
  expect(() => platformProductBilling()).toThrow(ProductBillingError);
  expect(rpc).not.toHaveBeenCalled();
});
it("does not contact billing or source custody until the configured consumer is used", () => {
  expect(platformProductBilling()).toBeDefined();
  expect(rpc).not.toHaveBeenCalled();
});
it("rejects production loopback even when the local fixture opt-in is set", () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GRIDA_PLATFORM_ALLOW_LOCAL", "1");
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "http://127.0.0.1:56842");
  expect(() => platformProductBilling()).toThrow(ProductBillingError);
  expect(rpc).not.toHaveBeenCalled();
});
