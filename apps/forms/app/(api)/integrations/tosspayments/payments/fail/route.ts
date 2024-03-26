import { NextRequest, NextResponse } from "next/server";

interface TossPaymentsFailUrlSearchParams {
  code: string; // by tosspayments
  message: string; // by tosspayments
}

function get_tosspayments_fail_url_search_params(
  searchParams: URLSearchParams
): TossPaymentsFailUrlSearchParams {
  const code = String(searchParams.get("code")); // by tosspayments
  const message = String(searchParams.get("message")); // by tosspayments

  return { code, message };
}

export function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;

  const { code, message } =
    get_tosspayments_fail_url_search_params(searchParams);

  console.log(`TossPayments Fail: ${code} - ${message}`);

  return NextResponse.redirect(origin, {
    status: 301,
  });
}
