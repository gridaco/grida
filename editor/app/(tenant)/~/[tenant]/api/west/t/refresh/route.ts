import { service_role } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import assert from "assert";
import { Platform } from "@/lib/platform";
import { renderSharable } from "../_utils/render-sharable";

const IS_HOSTED = process.env.VERCEL === "1";

/**
 * [refresh invitation]
 */
export async function POST(req: NextRequest) {
  //
  const headersList = await headers();
  const campaign_id = headersList.get("x-grida-west-campaign-id");
  const code = headersList.get("x-grida-west-token-code");
  const invitation_id = headersList.get("x-grida-west-invitation-id");

  assert(campaign_id, "x-grida-west-campaign-id is required");
  assert(code, "x-grida-west-token-code is required");
  assert(invitation_id, "x-grida-west-invitation-id is required");

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
        campaign:campaign_public(*),
        templates:campaign(
          invitation_email_template,
          invitation_share_template
        )
      `
    )
    .single();

  const invitation = _data as unknown as Platform.WEST.Referral.Invitation & {
    referrer: Omit<Platform.WEST.Referral.ReferrerPublicRead, "type">;
    campaign: Platform.WEST.Referral.CampaignPublic;
    templates: {
      invitation_email_template: unknown;
      invitation_share_template: unknown;
    };
  };

  if (refresh_err) {
    console.error("error while refreshing", refresh_err);
    return NextResponse.json({ error: refresh_err }, { status: 400 });
  }

  const { www_name, www_route_path } = invitation.campaign;
  const { invitation_share_template } = invitation.templates;

  return NextResponse.json({
    data: {
      code: invitation.code,
      sharable: renderSharable({
        template: invitation_share_template,
        context: {
          referrer_name: invitation.referrer.referrer_name ?? "",
          invitation_code: invitation.code,
          baseUrl: new URL(
            www_route_path ?? "",
            IS_HOSTED
              ? `https://${www_name}.grida.site/`
              : `http://${www_name}.localhost:3000/`
          ),
        },
      }),
    },
    error: null,
  });
}
