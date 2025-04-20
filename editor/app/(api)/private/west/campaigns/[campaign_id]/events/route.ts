import {
  createWestReferralClient,
  _sr_grida_west_referral_client,
} from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  campaign_id: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const { campaign_id: campaign_id } = await context.params;

  const rlsclient = await createWestReferralClient();

  // check access
  const { error } = await rlsclient
    .from("campaign")
    .select("id")
    .eq("id", campaign_id);

  if (error) {
    return notFound();
  }

  // SERVICE ROLE ACCESS
  const { data, error: fetch_err } = await _sr_grida_west_referral_client
    .from("event_log")
    .select("*")
    .eq("campaign_id", campaign_id)
    .order("time", { ascending: false })
    .limit(1000);

  if (fetch_err) {
    console.error("events", fetch_err);
    return new NextResponse("error", { status: 400 });
  }

  return NextResponse.json({
    data: data,
    error: null,
  });
}
