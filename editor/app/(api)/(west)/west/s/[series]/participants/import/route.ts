import { Platform } from "@/lib/platform";
import { createRouteHandlerWestClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

type Params = {
  series: string;
};

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<Params>;
  }
) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerWestClient(cookieStore);
  const { series } = await context.params;
  const body =
    (await req.json()) as Platform.WEST.ImportParticipantsRequestBody;

  const { data: campaign, error: campaign_fetch_err } = await supabase
    .from("campaign")
    .select()
    .eq("id", series)
    .single();
  if (campaign_fetch_err) {
    console.error("error while fetching campaign", campaign_fetch_err);
    return NextResponse.json({ error: campaign_fetch_err }, { status: 500 });
  }

  const upsertions = body.customer_ids.map((customer_id) => {
    return {
      project_id: campaign.project_id,
      series_id: series,
      customer_id,
      role: body.role,
    };
  });

  const { error, count } = await supabase
    .from("participant")
    .upsert(upsertions, {
      count: "exact",
      onConflict: "series_id, customer_id, role",
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
