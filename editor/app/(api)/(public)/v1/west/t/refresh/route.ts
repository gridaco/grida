import { service_role } from "@/lib/supabase/server";
import { buildTenantSiteBaseUrl } from "@/host/tenant-url";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { Platform } from "@/lib/platform";
import assert from "assert";

const IS_HOSTED = process.env.VERCEL === "1";

/**
 * [refresh invitation]
 */
export async function POST(req: NextRequest) {
  //
  const headersList = await headers();
  const campaign_id = headersList.get(
    Platform.headers["x-grida-west-campaign-id"]
  );
  const code = headersList.get(Platform.headers["x-grida-west-token-code"]);
  const invitation_id = headersList.get(
    Platform.headers["x-grida-west-invitation-id"]
  );

  assert(
    campaign_id,
    `${Platform.headers["x-grida-west-campaign-id"]} is required`
  );
  assert(code, `${Platform.headers["x-grida-west-token-code"]} is required`);
  assert(
    invitation_id,
    `${Platform.headers["x-grida-west-invitation-id"]} is required`
  );

  const { data: _data, error: refresh_err } = await service_role.west_referral
    .rpc("refresh", {
      p_campaign_id: campaign_id,
      p_invitation_id: invitation_id,
    })
    .select(
      `
        *,
        referrer:referrer_public_secure(
          *
        ),
        campaign:campaign_public(*)
      `
    )
    .single();

  const invitation = _data as unknown as Platform.WEST.Referral.Invitation & {
    referrer: Omit<Platform.WEST.Referral.ReferrerPublicRead, "type">;
    campaign: Platform.WEST.Referral.CampaignPublic;
  };

  if (refresh_err) {
    console.error("error while refreshing", refresh_err);
    return NextResponse.json({ error: refresh_err }, { status: 400 });
  }

  const { www_name: raw_www_name, www_route_path } = invitation.campaign;
  assert(raw_www_name, "campaign.www_name is required");

  const baseUrl = await buildTenantSiteBaseUrl({
    www_name: raw_www_name,
    www_route_path,
    hosted: IS_HOSTED,
    prefer_canonical: true,
  });
  const inviteUrl = `${baseUrl}/t/${invitation.code}`;

  return NextResponse.json({
    data: {
      code: invitation.code,
      sharable: {
        referrer_name: invitation.referrer.referrer_name ?? "",
        invitation_code: invitation.code,
        url: inviteUrl,
      } satisfies Platform.WEST.Referral.SharableContext,
    },
    error: null,
  });
}
