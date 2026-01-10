"use client";

import React from "react";
import { ScratchToReveal } from "@/www/ui/scratch-to-reveal";
import { Badge } from "@/components/ui/badge";
import ScratchAnimation from "@/www/ui/scratch-animation";
import * as Standard from "@/theme/templates/west-referral/standard";

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

export interface Props {
  logo?: {
    src: string;
    srcDark?: string;
    width?: number;
    height?: number;
  };
  coupon?: {
    src: string;
    alt?: string;
  };
}

export default function InvitationCouponTemplate({
  locale,
  data,
  design,
  onComplete,
}: {
  locale: keyof typeof dictionary;
  data: { referrer_name: string | null };
  design: Props;
  onComplete?: () => void;
}) {
  const [started, setStarted] = React.useState(false);

  const t = dictionary[locale];

  return (
    <main
      data-testid="west-referral-invitation-coupon"
      className="w-full h-full flex flex-col items-center justify-center"
    >
      <Standard.Header className="absolute top-0 z-10">
        {design.logo && (
          <Standard.Logo
            src={design.logo.src}
            srcDark={design.logo.srcDark}
            alt="logo"
            width={320}
            height={64}
            className="max-h-8 w-auto object-contain"
          />
        )}
      </Standard.Header>

      <section className="flex flex-col gap-4 items-center justify-center px-4 mt-10">
        <Badge variant="outline">
          {data.referrer_name} {t.invitedBy}
        </Badge>
        <ScratchToReveal
          width={320}
          height={320}
          minScratchPercentage={60}
          onComplete={onComplete}
          onStart={() => {
            console.log("started");
            setStarted(true);
          }}
          className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-background border shadow-lg"
          gradientColors={["#000", "#333", "#666"]}
        >
          {design.coupon && (
            <img
              src={design.coupon.src}
              alt={design.coupon.alt}
              width={640}
              height={640}
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 pointer-events-none">
            <ScratchAnimation width={350} height={350} enabled={!started} />
          </div>
        </ScratchToReveal>
        <p className="underline text-sm text-muted-foreground">
          {t.instruction}
        </p>
      </section>
    </main>
  );
}
