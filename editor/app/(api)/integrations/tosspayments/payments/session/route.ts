import { Env } from "@/env";
import {
  TossPaymentsCheckoutSessionRequest,
  TossPaymentsCheckoutSessionResponseData,
} from "@/types/integrations/api";
import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";

const INTEGRATIONS_TEST_TOSSPAYMENTS_CUSTOMER_KEY =
  process.env.INTEGRATIONS_TEST_TOSSPAYMENTS_CUSTOMER_KEY;

function build_toss_payments_success_url() {
  return `${Env.server.HOST}/integrations/tosspayments/payments/success`;
}

function build_toss_payments_fail_url() {
  return `${Env.server.HOST}/integrations/tosspayments/payments/fail`;
}

async function get_tosspayments_customer_key(
  form_id: string,
  testmode: boolean = true
): Promise<string> {
  if (testmode) return INTEGRATIONS_TEST_TOSSPAYMENTS_CUSTOMER_KEY as string;

  // TODO: find customer key by form_id
  return INTEGRATIONS_TEST_TOSSPAYMENTS_CUSTOMER_KEY as string;
}

export async function POST(req: NextRequest) {
  const { form_id, testmode, redirect } =
    (await req.json()) as TossPaymentsCheckoutSessionRequest;
  const orderId = nanoid();
  const orderName = `#${nanoid(4)}`;
  const customerKey = await get_tosspayments_customer_key(form_id, testmode);

  const session: TossPaymentsCheckoutSessionResponseData = {
    orderId,
    orderName: orderName,
    successUrl: redirect ? build_toss_payments_success_url() : "#",
    failUrl: redirect ? build_toss_payments_fail_url() : "#",
    // TODO:
    price: 1000,
    //
    customerKey: customerKey,
  };

  return NextResponse.json({ data: session, message: "success" });
}
