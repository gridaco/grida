"use client";

import React, { useCallback, useEffect } from "react";
import { Button as FancyButton } from "@/www/ui/button";
import { ScreenBackground } from "@/theme/templates/kit/components";
import { ArrowRight, GiftIcon } from "lucide-react";
import { motion } from "framer-motion";
import { PolestarTypeLogo } from "@/components/logos";
import { DialogClose } from "@radix-ui/react-dialog";
import { ScratchToReveal } from "@/www/ui/scratch-to-reveal";
import { ShineBorder } from "@/www/ui/shine-border";
import { Badge } from "@/components/ui/badge";
import ScratchAnimation from "@/www/ui/scratch-animation";

export default function Hello({
  data,
  onOpenChange,
}: {
  data: { referrer: string };
  onOpenChange?: (open: boolean) => void;
}) {
  return <BBB data={data} onOpenChange={onOpenChange} />;
}

function AAA({
  data,
  onOpenChange,
}: {
  data: { referrer: string };
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Background Image */}
      <ScreenBackground>
        <motion.img
          src="https://www.polestar.com/dato-assets/11286/1717404259-12-polestar-4-overview-interior-end-kr-d.png?q=80&dpr=2&w=1920"
          alt="Polestar 4"
          className="w-full h-full object-cover select-none pointer-events-none"
          initial={{ opacity: 0.5, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 3.5, ease: "easeOut" }}
        />
      </ScreenBackground>

      {/* Content Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent">
        <div className="container mx-auto px-4 pt-8">
          <PolestarTypeLogo className="text-white" />
          {/* <ACME className="text-white" /> */}

          {/* Hero Content */}
          <div className="mt-[20vh] max-w-xl space-y-4">
            <div className="flex flex-col gap-4">
              <h2 className="text-3xl font-medium text-white">
                {data.referrer}님이 추천하는
                <br /> Polestar 4
              </h2>
              {/* <p className="text-xl text-white">
              혁신적 디자인의 전기 퍼포먼스 SUV 쿠페
            </p> */}
              <p className="text-white/90">
                지금 시승 신청하고 100% 당첨 경품을 받아보세요.
              </p>
            </div>

            {/* <DialogClose asChild> */}
            <FancyButton
              effect="expandIcon"
              className="flex group bg-transparent outline rounded-none hover:bg-transparent hover:text-orange-500"
              icon={ArrowRight}
              onClick={() => onOpenChange?.(false)}
              iconPlacement="right"
            >
              <span>내용 확인하기</span>
            </FancyButton>
            {/* </DialogClose> */}
          </div>
        </div>
      </div>
    </div>
  );
}

function BBB({
  data,
  onOpenChange,
}: {
  data: { referrer: string };
  onOpenChange?: (open: boolean) => void;
}) {
  const [started, setStarted] = React.useState(false);

  return (
    <main className="w-dvw h-dvh flex flex-col items-center justify-center">
      <header className="flex flex-col gap-4 items-center justify-center px-4">
        <PolestarTypeLogo />
        <Badge variant="outline">
          {data.referrer} 님 께서 초대장을 보냈습니다.
        </Badge>
      </header>

      <section className="flex flex-col gap-4 items-center justify-center px-4 mt-10">
        <ScratchToReveal
          width={350}
          height={350}
          minScratchPercentage={75}
          onComplete={() => onOpenChange?.(false)}
          onStart={() => {
            console.log("started");
            setStarted(true);
          }}
          className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-background border shadow-lg"
          gradientColors={["#000", "#333", "#666"]}
        >
          <div className="w-full h-full p-6 flex flex-col items-center justify-center text-center">
            <GiftIcon className="size-10 text-muted-foreground mb-4" />
            <h2 className="text-xl font-bold">₩100,000 EV 충전 포인트</h2>
            <hr className="my-2" />
            <p className="text-sm text-muted-foreground">
              Polestar 4 시승 이벤트 에 참여하고 10만원 상당의 TMAP EV 충전
              포인트를 받아가세요
            </p>
            <div className="absolute inset-0 pointer-events-none">
              <ScratchAnimation width={350} height={350} enabled={!started} />
            </div>
          </div>
        </ScratchToReveal>
        <p className="underline text-sm text-muted-foreground">
          👆 카드를 손가락으로 긁어 주세요
        </p>
      </section>
    </main>
  );
}
