import { Platform } from "@/lib/platform";
import { sb } from "@/lib/supabase/server";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import assert from "assert";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const headersList = await headers();
  const cookieStore = await cookies();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");
  assert(code, "x-grida-west-token-code is required");
  assert(campaign_id, "x-grida-west-campaign-id is required");

  const rrwest = sb.rr.west_referral.createClient({
    headers: headersList,
    cookies: cookieStore,
  });

  // #region test codes
  if (
    code === Platform.WEST.Referral.TEST_CODE_REFERRER ||
    code === Platform.WEST.Referral.TEST_CODE_INVITATION
  ) {
    const now = new Date().toISOString();
    const { data: campaign, error: campaing_err } = await rrwest
      .from("campaign_public")
      .select()
      .eq("id", campaign_id)
      .single();

    if (campaing_err) {
      console.error(
        "test code was used, but campaign not found",
        campaing_err,
        campaign_id
      );
      return notFound();
    }

    if (code === Platform.WEST.Referral.TEST_CODE_REFERRER) {
      //
      return NextResponse.json({
        data: {
          id: code,
          type: "referrer",
          code: code,
          campaign: campaign,
          referrer_name: "DUMMY",
          invitation_count: 0,
          invitations: [],
        } satisfies Platform.WEST.Referral.ReferrerPublicRead,
        error: null,
      });
    } else if (code === Platform.WEST.Referral.TEST_CODE_INVITATION) {
      return NextResponse.json({
        data: {
          id: code,
          type: "invitation",
          code: code,
          campaign: campaign,
          referrer_name: "DUMMY",
          is_claimed: false,
          referrer_id: "DUMMY",
          created_at: now,
        } satisfies Platform.WEST.Referral.InvitationPublicRead,
        error: null,
      });
    }
  }
  // #endregion

  const { data: ref, error: ref_err } = await rrwest
    .rpc(
      "lookup",
      {
        p_campaign_id: campaign_id,
        p_code: code,
      },
      { get: true }
    )
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
      const { data, error } = await rrwest
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
      };
      break;
    }
    case "invitation": {
      const { data, error } = await rrwest
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
