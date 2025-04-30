import { service_role } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import assert from "assert";

/**
 * [track]
 */
export async function POST(req: NextRequest) {
  const { name, data } = await req.json();
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");

  assert(code, "x-grida-west-token-code is required");
  assert(campaign_id, "x-grida-west-campaign-id is required");

  const { error: track_err } = await service_role.west_referral.rpc("track", {
    p_campaign_id: campaign_id,
    p_code: code,
    p_name: name,
    p_data: data,
  });

  if (track_err) {
    console.error("track", track_err);
    return new NextResponse("error", { status: 400 });
  }

  return new NextResponse("ok", { status: 200 });
}
