import {
  createRouteHandlerWestReferralClient,
  grida_west_referral_client,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  campaign: string;
};

type Context = {
  params: Promise<Params>;
};

export async function GET(req: NextRequest, context: Context) {
  const { campaign: campaign_id } = await context.params;

  const cookieStore = cookies();
  const client = createRouteHandlerWestReferralClient(cookieStore);

  // check access
  const { error } = await client
    .from("campaign")
    .select("id")
    .eq("id", campaign_id);

  if (error) {
    return notFound();
  }

  // SERVICE ROLE ACCESS
  const { data, error: fetch_err } = await grida_west_referral_client
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
