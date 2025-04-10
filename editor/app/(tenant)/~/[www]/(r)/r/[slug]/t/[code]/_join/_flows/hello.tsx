"use client";

import React from "react";
import InvitationCouponTemplate from "@/theme/templates/west-referral/invitation/coupon";

const dictionary = {
  en: {
    invitedBy: "invited you",
    instruction: "👆 Scratch the card with your finger",
  },
  ko: {
    invitedBy: "님 께서 초대장을 보냈습니다.",
    instruction: "👆 카드를 손가락으로 긁어 주세요",
  },
};

export default function Hello({
  locale,
  data,
  onOpenChange,
}: {
  locale: keyof typeof dictionary;
  data: { referrer: string };
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <InvitationCouponTemplate
      locale={locale}
      data={{ referrer_name: data.referrer }}
      design={{
        logo: {
          src: "/logos/polestar.png",
          srcDark: "/logos/polestar-dark.png",
        },
        image: {
          src: "/mock/coupons/25-percent-off-square.png",
          alt: "invitation",
        },
      }}
      onComplete={() => onOpenChange?.(false)}
    />
  );
}
