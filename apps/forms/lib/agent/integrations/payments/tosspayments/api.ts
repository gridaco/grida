import { Env } from "@/env";
import {
  IntegrationsApiResponse,
  TossPaymentsCheckoutSessionRequest,
  TossPaymentsCheckoutSessionResponseData,
} from "@/types/integrations/api";

export async function request_toss_payments_checkout_session(
  req: TossPaymentsCheckoutSessionRequest
) {
  const res = await fetch(
    Env.client.HOST + "/integrations/tosspayments/payments/session",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    }
  );

  const { data } =
    (await res.json()) as IntegrationsApiResponse<TossPaymentsCheckoutSessionResponseData>;

  return data;
}
