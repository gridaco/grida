import { Platform } from "@/lib/platform";
import { grida_west_referral_client } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const campaign_slug = headersList.get("x-grida-west-campaign-slug");
  const code = headersList.get("x-grida-west-token-code");
  assert(code, "x-grida-west-token-code is required");
  assert(campaign_slug, "x-grida-west-campaign-slug is required");

  const { data: ref, error: ref_err } = await grida_west_referral_client
    .rpc("lookup", {
      p_campaign_ref: campaign_slug,
      p_code: code,
    })
    .single();

  if (ref_err) console.error("lookup failed", ref_err);
  if (!ref) return notFound();

  let campaign_public: Platform.WEST.Referral.CampaignPublic;
  let referrer: Omit<
    Platform.WEST.Referral.ReferrerPublicRead,
    "campaign"
  > | null = null;
  let invitation: Omit<
    Platform.WEST.Referral.InvitationPublicRead,
    "campaign"
  > | null = null;
  switch (ref.type) {
    case "referrer": {
      const { data, error } = await grida_west_referral_client
        .from("referrer_public_secure")
        .select(
          `
            *,
            campaign:campaign_public(*),
            invitations:invitation_public_secure(*)
          `
        )
        .eq("code", code)
        .eq("campaign_id", ref.campaign_id)
        .order("created_at", { referencedTable: "invitations" })
        .single();

      if (error) console.error(error);
      if (!data) return notFound();
      const { campaign, ...__private } = data;
      campaign_public = campaign;
      referrer = {
        type: "referrer",
        id: __private.id,
        code: __private.code,
        referrer_name: __private.referrer_name,
        invitation_count: __private.invitation_count,
        invitations: __private.invitations,
        created_at: __private.created_at,
      };
      break;
    }
    case "invitation": {
      const { data, error } = await grida_west_referral_client
        .from("invitation")
        .select(
          `
              *,
              campaign:campaign_public(*),
              referrer:referrer_public_secure(referrer_name)
            `
        )
        .eq("code", code)
        .eq("campaign_id", ref.campaign_id)
        .single();
      if (error) console.error(error);
      if (!data) return notFound();
      const { campaign, referrer, ...__private } = data;
      campaign_public = campaign;
      invitation = {
        type: "invitation",
        id: __private.id,
        code: __private.code,
        referrer_id: __private.referrer_id,
        referrer_name: referrer.referrer_name, // TODO:
        is_claimed: __private.is_claimed,
        created_at: __private.created_at,
      };
      break;
    }
  }

  return NextResponse.json({
    data: {
      type: ref.type,
      code: code,
      campaign: campaign_public,
      ...(referrer || invitation),
    } as
      | Platform.WEST.Referral.ReferrerPublicRead
      | Platform.WEST.Referral.InvitationPublicRead,
    error: null,
  });
}
