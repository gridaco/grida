import type { PaymentsServiceProviders } from "@/types";

export const payments_service_providers: ReadonlyArray<PaymentsServiceProviders> =
  ["stripe", "tosspayments"];

export const payments_service_providers_default = "stripe";

export const payments_service_providers_display_map = {
  stripe: { label: "Stripe" },
  tosspayments: { label: "Toss Payments" },
} as const;
