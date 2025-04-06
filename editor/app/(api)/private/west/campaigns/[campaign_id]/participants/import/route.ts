import { Platform } from "@/lib/platform";
import { createRouteHandlerWestReferralClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  campaign_id: number;
};

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerWestReferralClient(cookieStore);
  const { campaign_id: campaign_id } = await context.params;
  const body =
    (await req.json()) as Platform.WEST.Referral.ImportParticipantsRequestBody;

  const { role, customer_ids } = body;

  if (role !== "referrer") {
    return NextResponse.json({ error: "invalid role" }, { status: 400 });
  }

  const { data: campaign, error: campaign_fetch_err } = await supabase
    .from("campaign")
    .select()
    .eq("id", campaign_id)
    .single();
  if (campaign_fetch_err) {
    console.error("error while fetching campaign", campaign_fetch_err);
    return NextResponse.json({ error: campaign_fetch_err }, { status: 500 });
  }

  const upsertions = customer_ids.map((customer_id) => {
    return {
      project_id: campaign.project_id,
      campaign_id: campaign_id,
      customer_id,
    };
  });

  const { error, count } = await supabase.from("referrer").upsert(upsertions, {
    count: "exact",
    onConflict: "campaign_id, customer_id",
  });

  if (error) {
    console.error("error", error);
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json(
    {
      error: null,
      count,
    },
    { status: 200 }
  );
}
