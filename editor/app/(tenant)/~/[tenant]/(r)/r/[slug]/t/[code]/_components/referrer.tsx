"use client";

import React from "react";
import { Platform } from "@/lib/platform";
import ReferrerPageTemplate from "@/theme/templates/enterprise/west-referral/referrer/page";
import { TemplateData } from "@/theme/templates/enterprise/west-referral/templates";
import { getCampaignScheduleMessage } from "@/theme/templates/enterprise/west-referral/copy";
import {
  campaignShadcnThemeToCssText,
  resolveCampaignShadcnTheme,
} from "@/theme/shadcn/campaign-theme";

export default function ReferrerPage({
  context,
  client,
  template,
}: {
  template: TemplateData.West_Referrral__Duo_001;
  context: Platform.WEST.Referral.ReferrerPublicRead;
  client: Platform.WEST.Referral.WestReferralClient;
}) {
  const _t = template.theme;
  const _r = template.components.referrer;
  const shadcnTheme = resolveCampaignShadcnTheme(_t?.styles);
  const schedule_message = getCampaignScheduleMessage(
    context.campaign,
    template.locale
  );

  return (
    <>
      {shadcnTheme && (
        <style
          id="campaign-shadcn-theme"
          dangerouslySetInnerHTML={{
            __html: campaignShadcnThemeToCssText(shadcnTheme),
          }}
        />
      )}
      <ReferrerPageTemplate
        client={client}
        design={{
          logo: _t?.navbar?.logo,
          title: _r?.title ?? context.campaign.title,
          description: _r?.description ?? context.campaign.description,
          invitation_card_content: _r?.invitation_card_content,
          show_invitations: _r?.show_invitations,
          article: _r?.article,
          cta: _r?.cta ?? "Invite",
          image: _r?.image ?? { src: "" },
          schedule_message,
          share: {
            data: template.components["referrer-share"],
          },
          share_message: {
            data: template.components["referrer-share-message"],
          },
        }}
        locale={template.locale}
        data={context}
      />
    </>
  );
}
