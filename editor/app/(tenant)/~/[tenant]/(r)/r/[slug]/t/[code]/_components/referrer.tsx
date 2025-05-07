"use client";

import React from "react";
import { Platform } from "@/lib/platform";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import { TemplateData } from "@/theme/templates/west-referral/templates";

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

  return (
    <ReferrerPageTemplate
      client={client}
      design={{
        logo: _t?.navbar?.logo,
        title: _r?.title ?? context.campaign.title,
        description: _r?.description ?? context.campaign.description,
        article: _r?.article,
        cta: _r?.cta ?? "Invite",
        image: _r?.image ?? { src: "" },
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
  );
}
