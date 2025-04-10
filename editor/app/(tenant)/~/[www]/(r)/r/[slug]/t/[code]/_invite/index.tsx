"use client";

import React from "react";
import { Platform } from "@/lib/platform";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
import t from "./data-01.json";

export default function ReferrerPage({
  data,
}: {
  data: Platform.WEST.Referral.ReferrerPublicRead;
}) {
  const { referrer_name: _referrer_name } = data;
  const referrer_name = _referrer_name || "?";

  return (
    <ReferrerPageTemplate
      design={{
        logo: {
          src: "/logos/polestar.png",
          srcDark: "/logos/polestar-dark.png",
        },
        brand_name: "Polestar",
        title: "시승 초대 하고 경품 받기",
        description: `${referrer_name} 고객님의 Polestar 4 시승 추천 페이지입니다.`,
        favicon: {
          src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
          srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
        },
        article: { html: t.info },
        cta: {
          text: t.cta.label,
        },
        image: t.hero.media,
        footer: {
          link_privacy: "/privacy",
          link_instagram: "https://www.instagram.com/polestarcars/",
          paragraph: {
            html: "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100",
          },
        },
      }}
      locale="ko"
      data={data}
    />
  );
}
