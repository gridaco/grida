"use client";

import React from "react";
import { GiftIcon } from "lucide-react";
import { ScratchToReveal } from "@/www/ui/scratch-to-reveal";
import { Badge } from "@/components/ui/badge";
import ScratchAnimation from "@/www/ui/scratch-animation";
import * as Standard from "@/theme/templates/west-referral/standard";

export default function Hello({
  data,
  onOpenChange,
}: {
  data: { referrer: string };
  onOpenChange?: (open: boolean) => void;
}) {
  return <BBB data={data} onOpenChange={onOpenChange} />;
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
        <Standard.Logo
          src={"/logos/polestar.png"}
          srcDark={"/logos/polestar-dark.png"}
          alt="logo"
          width={320}
          height={64}
          className="max-h-8 w-auto object-contain"
        />
        <Badge variant="outline">
          {data.referrer} 님 께서 초대장을 보냈습니다.
        </Badge>
      </header>

      <section className="flex flex-col gap-4 items-center justify-center px-4 mt-10">
        <ScratchToReveal
          width={350}
          height={350}
          minScratchPercentage={60}
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
