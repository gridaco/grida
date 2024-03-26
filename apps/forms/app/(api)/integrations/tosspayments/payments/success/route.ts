import { NextRequest, NextResponse } from "next/server";

interface TossPaymentsSuccessUrlSearchParams {
  paymentKey: string; // by tosspayments
  orderId: string; // by tosspayments
  amount: string; // by tosspayments
}

function get_tosspayments_success_url_search_params(
  searchParams: URLSearchParams
): TossPaymentsSuccessUrlSearchParams {
  const paymentKey = String(searchParams.get("paymentKey")); // by tosspayments
  const orderId = String(searchParams.get("orderId")); // by tosspayments
  const amount = String(searchParams.get("amount")); // by tosspayments

  return { paymentKey, orderId, amount };
}

export function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const searchParams = req.nextUrl.searchParams;

  const { paymentKey, orderId, amount } =
    get_tosspayments_success_url_search_params(searchParams);

  console.log(`TossPayments Success: ${paymentKey} - ${orderId} - ${amount}`);

  return NextResponse.redirect(origin, {
    status: 301,
  });
}
