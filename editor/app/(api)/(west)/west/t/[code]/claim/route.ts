import { grida_west_client } from "@/lib/supabase/server";
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
  const { code } = await context.params;
  const headersList = await headers();
  // TODO: not good. should be using cookie session
  const series_id = headersList.get("x-grida-west-campaign-id");
  const customer_id = headersList.get("x-grida-customer-id");

  if (!series_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!customer_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: campaign, error: campaign_fetch_err } = await grida_west_client
    .from("campaign")
    .select()
    .eq("id", series_id)
    .single();

  if (campaign_fetch_err) {
    console.error(campaign_fetch_err);
    return NextResponse.json({ error: campaign_fetch_err }, { status: 500 });
  }

  // create participant for customer
  const { data: participant, error: participant_upsertion_err } =
    await grida_west_client
      .from("participant")
      .upsert({
        series_id: campaign.id,
        project_id: campaign.project_id,
        customer_id: customer_id,
        role: "guest",
      })
      .select("id")
      .single();

  if (participant_upsertion_err) {
    console.error(participant_upsertion_err);
    return NextResponse.json(
      { error: participant_upsertion_err },
      { status: 500 }
    );
  }

  const { data: next, error: mint_err } = await grida_west_client.rpc(
    "claim_token",
    {
      p_series_id: series_id,
      p_code: code,
      p_owner_id: participant.id,
    }
  );

  if (mint_err) {
    console.error(mint_err);
    return NextResponse.json({ error: mint_err }, { status: 500 });
  }

  return NextResponse.json({
    data: next,
    error: null,
  });
}
