import { grida_west_referral_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import assert from "assert";

/**
 * [invite]
 */
export async function POST(req: NextRequest) {
  //
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");

  console.log("invite", campaign_id, code);
  assert(campaign_id, "x-grida-west-campaign-id is required");
  assert(code, "x-grida-west-token-code is required");

  const { data: next, error: mint_err } = await grida_west_referral_client.rpc(
    "invite",
    {
      p_campaign_id: campaign_id,
      p_code: code,
    }
  );

  if (mint_err) {
    console.error("error while minting", mint_err);
    return NextResponse.json({ error: mint_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
