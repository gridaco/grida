"use client";
import { useEffect, useState } from "react";
import { TossPaymentsCheckout } from "../tosspayments/checkout";
import { request_toss_payments_checkout_session } from "@/lib/agent/integrations/payments/tosspayments/api";
import { TossPaymentsCheckoutSessionResponseData } from "@/types/integrations/api";

export function TossPaymentsPaymentFormFieldPreview({
  disabled,
}: {
  disabled?: boolean;
}) {
  const [session, setSession] =
    useState<TossPaymentsCheckoutSessionResponseData | null>(null);

  useEffect(() => {
    request_toss_payments_checkout_session({
      form_id: "replace-with-form-id",
      testmode: true,
      redirect: disabled ? false : true,
    }).then(setSession);
  }, [disabled]);

  return (
    <>
      {session ? (
        <>
          <TossPaymentsCheckout {...session} />
        </>
      ) : (
        <></>
      )}
    </>
  );
}
