import {
  createRouteHandlerWestReferralClient,
  grida_west_referral_client,
} from "@/lib/supabase/server";
import { cookies } from "next/headers";
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
  const from = req.nextUrl.searchParams.get("from") || undefined;
  const to = req.nextUrl.searchParams.get("to") || undefined;
  const interval = req.nextUrl.searchParams.get("interval") || undefined;

  const cookieStore = cookies();
  const rlsclient = createRouteHandlerWestReferralClient(cookieStore);

  // !!!
  // [analyze] bypasses rls for query efficiency. we need to explicitly check the ownership.
  // !!!
  const { data: campaign } = await rlsclient
    .from("campaign")
    .select("id")
    .eq("id", campaign_id)
    .single();

  if (!campaign) {
    return notFound();
  }

  const { data, error: analyze_err } = await grida_west_referral_client.rpc(
    "analyze",
    {
      p_campaign_id: campaign_id,
      p_time_from: from,
      p_time_to: to,
      p_interval: interval,
    },
    {
      get: true,
    }
  );

  if (analyze_err) {
    console.error("analyze", analyze_err);
    return NextResponse.json({ error: analyze_err }, { status: 500 });
  }

  return NextResponse.json({
    data: {
      interval,
      events: data,
    },
    error: null,
  });
}
