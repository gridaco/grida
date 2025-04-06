import { grida_west_referral_client } from "@/lib/supabase/server";
import assert from "assert";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

type Params = {
  code: string;
};

type Context = {
  params: Promise<Params>;
};

/**
 * [claim]
 */
export async function POST(req: NextRequest, context: Context) {
  const headersList = await headers();
  const campaign_ref = headersList.get("x-grida-west-campaign-ref");
  const customer_id = headersList.get("x-grida-customer-id");
  const code = headersList.get("x-grida-west-token-code");

  assert(campaign_ref, "campaign_ref is required");
  assert(code, "code is required");

  if (!customer_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 400 });
  }

  const { data: next, error: claim_err } = await grida_west_referral_client.rpc(
    "claim",
    {
      p_campaign_ref: campaign_ref,
      p_code: code,
      p_customer_id: customer_id,
    }
  );

  if (claim_err) {
    console.error("claim", claim_err);
    return NextResponse.json({ error: claim_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
