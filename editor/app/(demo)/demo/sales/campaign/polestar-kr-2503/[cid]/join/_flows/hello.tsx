"use client";

import React from "react";
import { Button as FancyButton } from "@/www/ui/button";
import { ScreenBackground } from "@/theme/templates/kit/components";
import { CampaignData } from "../../../data";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { PolestarTypeLogo } from "@/components/logos";
import { ACME } from "@/components/logos/acme";

export default function Hello({
  data,
  onNext,
}: {
  data: CampaignData;
  onNext?: () => void;
}) {
  return (
    <div className="relative min-h-screen w-full">
      {/* Background Image */}
      <ScreenBackground>
        <motion.img
          src="https://www.polestar.com/dato-assets/11286/1717404259-12-polestar-4-overview-interior-end-kr-d.png?q=80&dpr=2&w=1920"
          alt="Polestar 4"
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
          initial={{ opacity: 0.5, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 3.5, ease: "easeOut" }}
        />
      </ScreenBackground>

      {/* Content Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent">
        <div className="container mx-auto px-4 pt-8">
          {/* <PolestarTypeLogo className="text-white" /> */}
          <ACME className="text-white" />

          {/* Hero Content */}
          <div className="mt-[20vh] max-w-xl space-y-4">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl font-medium text-white">
                {data.user.name}님이 추천하는
                <br /> Polestar 4
              </h2>
              {/* <p className="text-xl text-white">
              혁신적 디자인의 전기 퍼포먼스 SUV 쿠페
            </p> */}
              <p className="text-white/90">
                지금 시승 신청하고 100% 당첨 경품을 받아보세요.
              </p>
            </div>

            <FancyButton
              onClick={onNext}
              effect="expandIcon"
              className="flex group bg-transparent outline rounded-none hover:bg-transparent hover:text-orange-500"
              icon={ArrowRight}
              iconPlacement="right"
            >
              <span>내용 확인하기</span>
            </FancyButton>
          </div>
        </div>
      </div>
    </div>
  );
}
