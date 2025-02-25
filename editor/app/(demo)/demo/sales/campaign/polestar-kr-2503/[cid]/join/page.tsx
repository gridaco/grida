"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import {
  ScreenBackground,
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
  ScreenWindowRoot,
} from "@/theme/templates/kit/components";
import { CampaignData, mock } from "../../data";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { CountdownTimer } from "../../timer";
import { Card } from "@/components/ui/card";

const EXT_FORM_LINK =
  "https://www.polestar.com/kr/test-drive/booking/ps4/at-polestar";

export default function BPage({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  const [stage, setStage] = React.useState(0);

  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  return (
    <ScreenWindowRoot>
      <ScreenRoot>
        <ScreenMobileFrame>
          <ScreenScrollable>
            {stage === 0 && <Hero data={d} onNext={() => setStage(1)} />}
            {stage === 1 && <Main />}
          </ScreenScrollable>
        </ScreenMobileFrame>
      </ScreenRoot>
    </ScreenWindowRoot>
  );
}

function Hero({ data, onNext }: { data: CampaignData; onNext?: () => void }) {
  return (
    <div className="relative min-h-screen w-full">
      {/* Background Image */}
      <ScreenBackground>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://www.polestar.com/dato-assets/11286/1717404259-12-polestar-4-overview-interior-end-kr-d.png?q=80&dpr=2&w=1920"
          alt="Polestar 4"
          className="absolute inset-0 w-full h-full object-cover select-none pointer-events-none"
        />
      </ScreenBackground>

      {/* Content Overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent">
        <div className="container mx-auto px-4 pt-8">
          {/* Logo */}
          <h1 className="text-3xl font-bold text-white mb-auto">Polestar</h1>

          {/* Hero Content */}
          <div className="mt-[30vh] max-w-xl space-y-4">
            <h2 className="text-5xl font-bold text-white">
              {data.user.name}님이 추천하는 Polestar 4
            </h2>
            <p className="text-xl text-white">
              혁신적 디자인의 전기 퍼포먼스 SUV 쿠페
            </p>
            <p className="text-white/90">
              지금 시승 신청하고 100% 당첨 경품을 받아보세요
            </p>

            <Button onClick={onNext} variant="default">
              내용 확인 하기
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Main() {
  return (
    <div>
      {/* Header */}
      <header className="py-4">
        <h1 className="text-3xl font-light text-center">Polestar</h1>
      </header>

      {/* Hero Section */}
      <div className="relative w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://www.polestar.com/dato-assets/11286/1725964311-pak_home_image-card_pc.jpeg?q=35&dpr=2&w=542"
          alt="Polestar 4"
          className="object-cover aspect-square select-none pointer-events-none"
        />
        <div className="absolute bottom-8 left-8">
          <h2 className="text-3xl font-bold text-white">Polestar 4</h2>
          <p className="text-white mt-2">시승 초대하고 경품을 받아보세요</p>
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex justify-center items-center py-12 px-4">
        <CountdownTimer />
      </div>

      {/* Stats Grid */}
      <Card className="mx-4 p-6 grid grid-cols-3 gap-4 divide-x">
        <div className="text-center">
          <p className="text-3xl font-bold">1명</p>
          <p className="text-sm mt-2">Polestar 4</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">30명</p>
          <p className="text-sm mt-2">iPad Air 11</p>
        </div>
        <div className="text-center">
          <p className="text-3xl font-bold">100%</p>
          <p className="text-sm mt-2">스타벅스 아메리카노</p>
        </div>
      </Card>

      {/* Info Section */}
      <div className="px-4 py-8 space-y-4">
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>1인 당 중복 신청은 불가합니다.</span>
        </p>
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>
            시승 초대를 한 고객과, 초대 링크를 통해 시승 신청을 한 고객 모두에게
            경품을 드립니다.
          </span>
        </p>
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>무료 시승입니다.</span>
        </p>
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>시승 전 약 15분의 차량 설명 시간이 있습니다.</span>
        </p>
      </div>

      {/* CTA Button */}
      <footer className="bottom-0 left-0 right-0 bg-white p-4 shadow-t">
        <Button
          onClick={() => {
            window.open(EXT_FORM_LINK, "_blank");
          }}
          className="w-full bg-black text-white hover:bg-gray-800"
          size="lg"
        >
          시승 신청하기
        </Button>
      </footer>
    </div>
  );
}
