"use client";
///
/// example from https://developers.tosspayments.com/sandbox
///
import React, {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import {
  loadPaymentWidget,
  ANONYMOUS,
  PaymentWidgetInstance,
} from "@tosspayments/payment-widget-sdk";
import clsx from "clsx";
import { TossPaymentsCheckoutSessionResponseData } from "@/types/integrations/api";

interface TossPaymentsCheckoutSessionContext
  extends TossPaymentsCheckoutSessionResponseData {
  paymentWidgetRef: React.MutableRefObject<PaymentWidgetInstance | null>;
}

const TossPaymentsCheckoutSessionContext =
  createContext<TossPaymentsCheckoutSessionContext | null>(null);

export function TossPaymentsCheckoutProvider({
  initial,
  children,
}: React.PropsWithChildren<{
  initial: TossPaymentsCheckoutSessionResponseData | null;
}>) {
  const [session, setSession] =
    useState<TossPaymentsCheckoutSessionContext | null>(null);

  const paymentWidgetRef = useRef<PaymentWidgetInstance>(null);

  useEffect(() => {
    if (!initial) {
      return;
    }

    const updatedSession = { ...initial, paymentWidgetRef };
    setSession(updatedSession);
  }, [initial]);

  return (
    <TossPaymentsCheckoutSessionContext.Provider value={session}>
      {children}
    </TossPaymentsCheckoutSessionContext.Provider>
  );
}

export function useTossPaymentsCheckoutSession() {
  if (TossPaymentsCheckoutSessionContext == null) {
    throw new Error(
      "useTossPaymentsCheckoutSession must be used within a TossPaymentsCheckoutProvider"
    );
  }
  return useContext(TossPaymentsCheckoutSessionContext);
}

export function TossPaymentsCheckout({
  children,
}: React.PropsWithChildren<{}>) {
  const session = useTossPaymentsCheckoutSession();

  const paymentMethodsWidgetRef = useRef<any>(null);
  const agreementWidgetRef = useRef<any>(null);

  useEffect(() => {
    if (!session) {
      return;
    }

    const { customerKey, price } = session;

    (async () => {
      const paymentWidget = await loadPaymentWidget(customerKey, ANONYMOUS); // 비회원 customerKey

      if (session.paymentWidgetRef.current == null) {
        session.paymentWidgetRef.current = paymentWidget;
      }

      /**
       * 결제창을 렌더링합니다.
       * @docs https://docs.tosspayments.com/reference/widget-sdk#renderpaymentmethods%EC%84%A0%ED%83%9D%EC%9E%90-%EA%B2%B0%EC%A0%9C-%EA%B8%88%EC%95%A1
       */
      const paymentMethodsWidget =
        session.paymentWidgetRef.current?.renderPaymentMethods(
          "#payment-method",
          { value: price },
          { variantKey: "DEFAULT" }
        );

      /**
       * 약관을 렌더링합니다.
       * @docs https://docs.tosspayments.com/reference/widget-sdk#renderagreement%EC%84%A0%ED%83%9D%EC%9E%90-%EC%98%B5%EC%85%98
       */
      agreementWidgetRef.current =
        session.paymentWidgetRef.current?.renderAgreement("#agreement", {
          variantKey: "DEFAULT",
        });

      paymentMethodsWidgetRef.current = paymentMethodsWidget;
    })();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.customerKey, session?.price]);

  return (
    <div className="bg-white rounded-lg overflow-hidden shadow-sm min-h-44">
      <div>
        <div id="payment-method" />
        <div id="agreement" />
        {children}
      </div>
    </div>
  );
}

/**
 * This is a layout container if the pay button is used within a checkout widget.
 * @returns
 */
export function TossPaymentsPayButtonContainerFooter({
  children,
}: React.PropsWithChildren<{}>) {
  return <footer className="px-4 pb-2">{children}</footer>;
}

export function TossPaymentsPayButton({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const session = useTossPaymentsCheckoutSession();

  const classname = clsx(
    "w-full",
    "text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none dark:focus:ring-blue-800",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    className
  );

  if (!session) {
    return (
      <button {...props} className={classname}>
        {children || "결제하기"}
      </button>
    );
  }

  const {
    orderId,
    orderName,
    customerName,
    customerEmail,
    customerMobilePhone,
    successUrl,
    failUrl,
    paymentWidgetRef,
  } = session;

  const disabled = !paymentWidgetRef.current;

  return (
    <button
      {...props}
      disabled={disabled || props.disabled}
      className={classname}
      onClick={async () => {
        const paymentWidget = paymentWidgetRef.current;

        try {
          /**
           * 결제 요청
           * @docs https://docs.tosspayments.com/reference/widget-sdk#requestpayment%EA%B2%B0%EC%A0%9C-%EC%A0%95%EB%B3%B4
           */
          await paymentWidget?.requestPayment({
            orderId,
            orderName,
            customerName,
            customerEmail,
            customerMobilePhone,
            successUrl: successUrl + window.location.search,
            failUrl: failUrl + window.location.search,
          });
        } catch (error) {
          // TODO: 에러 처리
        }
      }}
    >
      {children || "결제하기"}
    </button>
  );
}
