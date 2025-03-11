"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { CampaignData, mock } from "../../data";
import { CountdownTimer } from "../../timer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ACME } from "@/components/logos/acme";
import data from "./data.json";
import Link from "next/link";

const mkshare = (d: CampaignData) => {
  return {
    title: "Polestar 2",
    text: `${d.user.name}님의 Polestar 2 시승 초대 이벤트`,
    url:
      process.env.NODE_ENV === "production"
        ? `https://demo.grida.co/demo/sales/campaign/polestar-kr-2503/${d.cid}/join`
        : `http://localhost:3000/demo/sales/campaign/polestar-kr-2503/${d.cid}/join`,
  };
};

export default function Invite({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  const onshareclick = () => {
    if (!navigator.share) return;
    navigator
      .share(mkshare(d))
      .then(() => {
        alert("Thanks for sharing!");
      })
      .catch(() => {
        alert("cancel sharing");
      });
  };

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <main className="bg-background">
            <div>
              {/* Header */}
              <header className="py-4 flex items-center justify-center">
                {/* PolestarTypeLogo */}
                <ACME className="text-foreground" />
              </header>

              {/* Hero Section */}
              <div className="relative w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.hero.media.src}
                  alt={data.hero.media.alt}
                  className="object-cover aspect-square @4xl:aspect-video select-none pointer-events-none w-full"
                />
                <div className="absolute bottom-8 left-8">
                  <h2 className="text-2xl text-white">
                    <span
                      dangerouslySetInnerHTML={{ __html: data.hero.title }}
                    />
                  </h2>
                </div>
              </div>

              {/* Countdown Timer */}
              <div className="flex justify-center items-center py-12 px-4">
                <CountdownTimer />
              </div>

              {/* Stats Grid */}
              <Card className="mx-4 py-4 px-6 grid grid-cols-3">
                {data.perks.map((perk, index) => (
                  <div key={index} className="text-center">
                    <p className="text-xl font-medium">{perk.value}</p>
                    <p className="text-sm font-light mt-2 text-muted-foreground">
                      {perk.label}
                    </p>
                  </div>
                ))}
              </Card>

              {/* Info Section */}
              <div className="pt-12 pb-8 space-y-2">
                <article className="prose prose-sm dark:prose-invert">
                  <span dangerouslySetInnerHTML={{ __html: data.info }} />
                </article>
              </div>
              <div className="flex justify-center items-center pb-8 px-4">
                <AccordionDemo />
              </div>

              {/* CTA Button */}
              <footer className="bottom-0 left-0 right-0 bg-background p-4 shadow-t">
                <Link href={data.cta.link} target="_blank">
                  <Button className="w-full" size="lg">
                    {data.cta.label}
                  </Button>
                </Link>
              </footer>
            </div>
          </main>
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function AccordionDemo() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger className="text-base font-normal">
          Spaces
        </AccordionTrigger>
        <AccordionContent>
          {" "}
          <PolestarLocation />{" "}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger className="text-base font-normal">
          About this Campaign
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

function PolestarLocation() {
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
