import { _sr_grida_west_referral_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import assert from "assert";

/**
 * [claim]
 */
export async function POST(req: NextRequest) {
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const customer_id = headersList.get("x-grida-customer-id");
  const code = headersList.get("x-grida-west-token-code");

  assert(campaign_id, "x-grida-west-campaign-id is required");
  assert(code, "x-grida-west-token-code is required");

  if (!customer_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 400 });
  }

  const { data: next, error: claim_err } =
    await _sr_grida_west_referral_client.rpc("claim", {
      p_campaign_id: campaign_id,
      p_code: code,
      p_customer_id: customer_id,
    });

  if (claim_err) {
    console.error("claim", claim_err);
    return NextResponse.json({ error: claim_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
