// GRIDA-EE: billing — lazy product admission and durable source custody.
import "server-only";
import { service_role } from "../supabase/server";
import { configuredOrigin } from "./billing-consumer";
import { ProductBilling, ProductBillingError } from "./product-billing";

export function platformProductBilling() {
  try {
    return new ProductBilling(
      {
        origin: configuredOrigin(
          process.env.GRIDA_PLATFORM_BILLING_ORIGIN,
          process.env
        ),
        keyId: process.env.GRIDA_PLATFORM_USAGE_KEY_ID ?? "",
        token: process.env.GRIDA_PLATFORM_USAGE_TOKEN ?? "",
        development: process.env.GRIDA_PLATFORM_ALLOW_LOCAL === "1",
      },
      async (name, args) =>
        await service_role.workspace.rpc(name as never, args as never)
    );
  } catch {
    throw new ProductBillingError();
  }
}
