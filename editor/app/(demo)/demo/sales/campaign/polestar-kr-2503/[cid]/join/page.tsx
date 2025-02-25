"use client";
import React from "react";
import { Button as FancyButton } from "@/www/ui/button";
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
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { motion } from "framer-motion";
import { PolestarTypeLogo } from "@/components/logos";

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
          <PolestarTypeLogo className="text-white" />

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

function Main() {
  return (
    <div>
      {/* Header */}
      <header className="py-4 flex items-center justify-center">
        <PolestarTypeLogo className="text-black" />
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
          <h2 className="text-2xl text-white">
            Polestar 4<br />
            시승 신청하고 경품을 받아보세요
          </h2>
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex justify-center items-center py-12 px-4">
        <CountdownTimer />
      </div>

      {/* Stats Grid */}
      <Card className="mx-4 py-4 px-6 grid grid-cols-3">
        <div className="text-center it">
          <p className="text-xl font-medium">1명</p>
          <p className="text-sm font-light mt-2 text-muted-foreground">
            Polestar 4
          </p>
        </div>
        <div className="text-center">
          <p className="text-xl font-medium">20명</p>
          <p className="text-sm font-light mt-2 text-muted-foreground">
            iPad Air 11
          </p>
        </div>
        <div className="text-center">
          <p className="text-xl font-medium">100%</p>
          <p className="text-sm font-light mt-2 text-muted-foreground">
            스타벅스 아메리카노
          </p>
        </div>
      </Card>

      {/* Info Section */}
      <div className="px-6 pt-12 pb-8 space-y-2">
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
      <div className="flex justify-center items-center pb-8 px-4">
        <AccordionDemo />
      </div>

      {/* CTA Button */}
      <footer className="bottom-0 left-0 right-0 bg-white p-4 shadow-t">
        <Button
          onClick={() => {
            window.open(EXT_FORM_LINK, "_blank");
          }}
          className="w-full bg-black text-white hover:bg-gray-800 rounded-none py-6"
          size="lg"
        >
          시승 신청하기
        </Button>
      </footer>
    </div>
  );
}

export function AccordionDemo() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger className="text-base font-normal">
          Polestar Space
        </AccordionTrigger>
        <AccordionContent>
          {" "}
          <PolestarLocation />{" "}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger className="text-base font-normal">
          이벤트 안내 사항
        </AccordionTrigger>
        <AccordionContent className="text-sm font-normal">
          1. 시승이 완료된 후 경품이 지급됩니다. <br /> 2. 시승 신청자 본인에
          한하여 시승 가능하며, 타인에게 양도할 수 없습니다. <br /> 3. 운전면허
          소지자 중 만 21세 이상 및 실제 도로 주행 경력 2년 이상의 분들만 참여
          가능합니다.
          <br /> 4. 차량 시승 기간 중 총 주행 가능 거리는 300Km로 제한됩니다.
          <br /> 5. 시승 기간 중 발생한 통행료, 과태료, 범칙금은 시승 고객 본인
          부담입니다. <br /> 6. 시승 신청자에게 휴대폰 문자로 상세 안내
          예정입니다.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

export function PolestarLocation() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 p-4 w-[250px] border border-slate-300 rounded-md">
        <p className="font-medium">Polestar 경기</p>
        <span className="text-xs text-muted-foreground">
          대한민국 경기도 하남시 신장동 미사대로 750
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4 w-[250px] border border-slate-300 rounded-md">
        <p className="font-medium">Polestar 부산</p>
        <span className="text-xs text-muted-foreground">
          대한민국 부산광역시 해운대구 센텀4로 15 센텀시티 몰 1층
        </span>
      </div>
    </div>
  );
}
