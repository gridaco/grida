import { service_role } from "../supabase/server";
import { ProductBilling, ProductBillingError } from "./product-billing";

export function billingOwner(): "grida" | "infra" {
  const owner = process.env.GRIDA_BILLING_OWNER ?? "grida";
  if (owner !== "grida" && owner !== "infra") throw new ProductBillingError();
  return owner;
}
export function assertSourceBillingConfiguration() {
  if (billingOwner() !== "grida") throw new ProductBillingError();
}
/** Called at the SDK's actual HTTP boundary, including cached SDK instances. */
export async function sourceBillingFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  await assertSourceBillingAuthority();
  return fetch(input, init);
}
export async function assertSourceBillingAuthority() {
  assertSourceBillingConfiguration();
  const { data, error } = await service_role.workspace.rpc(
    "platform_billing_owner" as never
  );
  if (error || !data || (data as { owner?: string }).owner !== "grida")
    throw new ProductBillingError();
}
export function platformProductBilling() {
  if (billingOwner() !== "infra") throw new ProductBillingError();
  return new ProductBilling(
    {
      origin: process.env.GRIDA_PLATFORM_BILLING_ORIGIN ?? "",
      keyId: process.env.GRIDA_PLATFORM_USAGE_KEY_ID ?? "",
      token: process.env.GRIDA_PLATFORM_USAGE_TOKEN ?? "",
      development: process.env.GRIDA_PLATFORM_ALLOW_LOCAL === "1",
    },
    async (name, args) =>
      await service_role.workspace.rpc(name as never, args as never)
  );
}
