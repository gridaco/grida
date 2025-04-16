import { grida_west_referral_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import assert from "assert";
import { notFound } from "next/navigation";

/**
 * [refresh invitation]
 */
export async function POST(req: NextRequest) {
  //
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");
  const invitation_id = headersList.get("x-grida-west-invitation-id");

  assert(campaign_id, "x-grida-west-campaign-id is required");
  assert(code, "x-grida-west-token-code is required");
  assert(invitation_id, "x-grida-west-invitation-id is required");

  const { data: next, error: refresh_err } =
    await grida_west_referral_client.rpc("refresh", {
      p_campaign_id: campaign_id,
      p_invitation_id: invitation_id,
    });

  if (refresh_err) {
    console.error("error while refreshing", refresh_err);
    return NextResponse.json({ error: refresh_err }, { status: 400 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
