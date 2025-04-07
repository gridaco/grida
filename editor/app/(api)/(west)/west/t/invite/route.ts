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
  const campaign_slug = headersList.get("x-grida-west-campaign-slug");
  const code = headersList.get("x-grida-west-token-code");

  console.log("invite", campaign_slug, code);
  assert(campaign_slug, "x-grida-west-campaign-slug is required");
  assert(code, "x-grida-west-token-code is required");

  const { data: next, error: mint_err } = await grida_west_referral_client.rpc(
    "invite",
    {
      p_campaign_ref: campaign_slug,
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
