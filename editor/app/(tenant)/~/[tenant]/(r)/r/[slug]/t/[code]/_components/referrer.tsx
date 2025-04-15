"use client";

import React from "react";
import { Platform } from "@/lib/platform";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import { TemplateData } from "@/theme/templates/west-referral/templates";

export default function ReferrerPage({
  slug,
  context,
  client,
  template,
}: {
  slug: string;
  template: TemplateData.West_Referrral__Duo_001["components"]["referrer"];
  context: Platform.WEST.Referral.ReferrerPublicRead;
  client: Platform.WEST.Referral.WestReferralClient;
}) {
  return (
    <ReferrerPageTemplate
      slug={slug}
      client={client}
      design={{
        // logo: {
        //   src: "/logos/polestar.png",
        //   srcDark: "/logos/polestar-dark.png",
        // },
        favicon: {
          src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
          srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
        },
        brand_name: "Polestar",
        title: template?.title ?? context.campaign.title,
        description: template?.description ?? context.campaign.description,
        article: template?.article,
        cta: template?.cta ?? "Invite",
        image: template?.image ?? { src: "" },
        // footer: {
        //   link_privacy: "/privacy",
        //   link_instagram: "https://www.instagram.com/polestarcars/",
        //   paragraph: {
        //     html: "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100",
        //   },
        // },
      }}
      locale="ko"
      data={context}
    />
  );
}
