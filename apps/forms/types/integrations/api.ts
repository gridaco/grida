interface TossPaymentsIntegrationPublicKeys {
  customerKey: string;
}

type TossPaymentsMobileCarrier = "KT" | "LGU" | "SKT" | "HELLO" | "KCT" | "SK7";

interface TossPaymentsShipping {
  fullName?: string;
  address?: TossPaymentsAddress;
}

interface TossPaymentsPaymentMethodOptions {
  paypal?: {
    setTransactionContext: any;
  };
}

interface TossPaymentsProduct {
  name: string;
  quantity: number;
  unitAmount: number;
  currency: string;
  description: string;
}

interface TossPaymentsAddress {
  country: string;
  line1?: string;
  line2?: string;
  area1?: string;
  area2: string;
  postalCode?: string;
}

interface TossPaymentsBasePaymentInfo {
  orderId: string;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
  appScheme?: string;
  taxFreeAmount?: number;
  taxExemptionAmount?: number;
  cultureExpense?: boolean;
  useEscrow?: boolean;
  escrowProducts?: TossPaymentsEscrowProduct[];
  customerMobilePhone?: string;
  showCustomerMobilePhone?: boolean;
  mobileCarrier?: TossPaymentsMobileCarrier[];
  products?: TossPaymentsProduct[];
  shipping?: TossPaymentsShipping;
  paymentMethodOptions?: TossPaymentsPaymentMethodOptions;
  useInternationalCardOnly?: boolean;
}

interface TossPaymentsEscrowProduct {
  id: string;
  code: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface TossPaymentsCheckoutSessionRequest {
  form_id: string;
  testmode?: boolean;
  /**
   * setting redirect to false will return # as successUrl and failUrl, which disables the redirection and default behavior.
   * this also causes client error by widget-sdk
   */
  redirect?: boolean;
}

export interface TossPaymentsCheckoutSessionResponseData
  extends TossPaymentsBasePaymentInfo,
    TossPaymentsIntegrationPublicKeys {
  successUrl: string;
  failUrl: string;
  price: number;
}

export interface IntegrationsApiResponse<T> {
  data: T;
  message: string;
}
