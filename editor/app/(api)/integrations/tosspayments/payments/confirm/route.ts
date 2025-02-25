///
/// example from https://developers.tosspayments.com/sandbox
///

import { NextRequest, NextResponse } from "next/server";

const INTEGRATIONS_TEST_TOSSPAYMENTS_SECRET_KEY =
  process.env.INTEGRATIONS_TEST_TOSSPAYMENTS_SECRET_KEY;

function get_tosspayments_secret_key() {
  // TODO: this shall be replaced with configured value
  // users will set thir secret key from below.
  // @docs https://docs.tosspayments.com/reference/using-api/api-keys
  return INTEGRATIONS_TEST_TOSSPAYMENTS_SECRET_KEY;
}

interface TossPaymentsConfirmPaymentInfo {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export async function POST(req: NextRequest) {
  const data = await req.json();

  const result = await toss_payments_request_confirm_payment(data);
  return NextResponse.json({ data: result });
}

async function toss_payments_request_confirm_payment(
  paymentInfo: TossPaymentsConfirmPaymentInfo
) {
  const { paymentKey, orderId, amount } = paymentInfo;
  const secretKey = get_tosspayments_secret_key();
  // 토스페이먼츠 API는 시크릿 키를 사용자 ID로 사용하고, 비밀번호는 사용하지 않습니다.
  // 비밀번호가 없다는 것을 알리기 위해 시크릿 키 뒤에 콜론을 추가합니다.
  // @docs https://docs.tosspayments.com/reference/using-api/authorization#%EC%9D%B8%EC%A6%9D
  const encryptedSecretKey =
    "Basic " + Buffer.from(secretKey + ":").toString("base64");

  // ------ 결제 승인 API 호출 ------
  // @docs https://docs.tosspayments.com/guides/payment-widget/integration#3-결제-승인하기
  const response = await fetch(
    "https://api.tosspayments.com/v1/payments/confirm",
    {
      method: "POST",
      body: JSON.stringify({ orderId, amount, paymentKey }),
      headers: {
        Authorization: encryptedSecretKey,
        "Content-Type": "application/json",
      },
    }
  );
  const data = await response.json();
  console.log("toss_payments_request_confirm_payment", data);

  return data;
}
