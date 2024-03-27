import {
  IntegrationsApiResponse,
  TossPaymentsCheckoutSessionRequest,
  TossPaymentsCheckoutSessionResponseData,
} from "@/types/integrations/api";

const HOST = process.env.HOST || "http://localhost:3000";

export async function request_toss_payments_checkout_session(
  req: TossPaymentsCheckoutSessionRequest
) {
  const res = await fetch(
    HOST + "/integrations/tosspayments/payments/session",
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
