import { grida_west_referral_client } from "@/lib/supabase/server";
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
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const customer_id = headersList.get("x-grida-customer-id");

  if (!campaign_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (!customer_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: campaign, error: campaign_fetch_err } =
    await grida_west_referral_client
      .from("campaign")
      .select()
      .eq("id", campaign_id)
      .single();

  if (campaign_fetch_err) {
    console.error(campaign_fetch_err);
    return NextResponse.json({ error: campaign_fetch_err }, { status: 500 });
  }

  const { data: next, error: mint_err } = await grida_west_referral_client.rpc(
    "claim",
    {
      p_campaign_id: campaign_id,
      p_code: code,
      p_customer_id: customer_id,
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
