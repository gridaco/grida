import { TossPaymentsCheckout } from "@/components/tosspayments/checkout";
import { request_toss_payments_checkout_session } from "@/lib/agent/integrations/payments/tosspayments/api";

export const revalidate = 0;

export default async function TossPaymentsDevPage() {
  const session = await request_toss_payments_checkout_session({
    form_id: "replace-with-form-id",
    testmode: true,
    redirect: true,
  });

  return <TossPaymentsCheckout {...session} />;
}
