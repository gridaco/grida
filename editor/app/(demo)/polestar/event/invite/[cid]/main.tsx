"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
// import data from "./data.json";
import data from "./data-01.json";
import Link from "next/link";
import toast from "react-hot-toast";
import { PolestarTypeLogo } from "@/components/logos";

const mkshare = (d: CampaignData) => {
  return {
    title: "Polestar 2",
    text: `${d.user.name}님의 Polestar 2 시승 초대 이벤트`,
    url:
      process.env.NODE_ENV === "production"
        ? `https://app.grida.co/polestar/event/join/${d.cid}`
        : `http://localhost:3000/polestar/event/join/${d.cid}`,
  };
};

export default function Invite({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  const [supply, setSupply] = React.useState(10);
  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  const onshareclick = () => {
    if (!navigator.share) return;
    navigator
      .share(mkshare(d))
      .then(() => {
        setSupply((supply) => supply - 1);
        alert("Thanks for sharing!");
      })
      .catch((e) => {
        console.log("error while sharing", e);
      });
  };

  return (
    <ScreenRoot>
      <ScreenMobileFrame>
        <ScreenScrollable>
          <main className="bg-background h-full flex flex-col">
            {/* Header */}
            <header className="py-4 flex items-center justify-center">
              <PolestarTypeLogo />
              {/* <ACME className="text-foreground" /> */}
            </header>

            {/* Hero Section */}
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={data.hero.media.src}
                alt={data.hero.media.alt}
                className="object-cover aspect-square select-none pointer-events-none w-full"
              />
              {/* overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-8 left-8">
                <h2 className="text-2xl text-white">
                  {/* <span
                      dangerouslySetInnerHTML={{ __html: data.hero.title }}
                    /> */}
                  안녕하세요 {d.user.name}님, <br />
                  Polestar 4 시승 초대 이벤트에 <br />
                  초대합니다.
                </h2>
              </div>
            </div>

            {/* Stats Grid */}
            <Card className="mt-10 mx-4 py-4 px-6 grid grid-cols-3">
              {data.perks.map((perk, index) => (
                <div key={index} className="text-center">
                  <p className="text-xl font-medium">{perk.value}</p>
                  <p className="text-sm font-light mt-2 text-muted-foreground">
                    {perk.label}
                  </p>
                </div>
              ))}
            </Card>

            <div className="mt-10 mx-4">
              <Card>
                <CardHeader>
                  <CardTitle>{d.user.name}님 의 초대권</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-lg font-bold">{supply}장 남음</span>
                  <hr className="my-4" />
                  <p className="text-sm text-muted-foreground">
                    초대권을 사용해 지인에게 시승 이벤트를 공유하세요.{" "}
                    {d.user.name}님과 참여자분 모두에게 경품이 지급됩니다.
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Info Section */}
            <div className="pt-12 pb-8 space-y-2">
              <article className="prose prose-sm dark:prose-invert">
                <span dangerouslySetInnerHTML={{ __html: data.info }} />
              </article>
            </div>
            <div className="flex justify-center items-center pb-8 px-4">
              <AccordionDemo />
            </div>

            <div className="flex-1" />
            {/* CTA Button */}
            <footer className="sticky bottom-0 mt-auto left-0 right-0 bg-background p-4 border-t">
              <Button className="w-full" size="lg" onClick={onshareclick}>
                {data.cta.label}
              </Button>
            </footer>
          </main>
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function AccordionDemo() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-2">
        <AccordionTrigger className="text-base font-normal">
          이벤트 FAQ
        </AccordionTrigger>
        <AccordionContent className="text-sm font-normal">
          <article className="prose prose-sm dark:prose-invert">
            <ol>
              <li>시승이 완료된 후 경품이 지급됩니다. </li>
              <li>
                시승 신청자 본인에 한하여 시승 가능하며, 타인에게 양도할 수
                없습니다.
              </li>
              <li>
                운전면허 소지자 중 만 21세 이상 및 실제 도로 주행 경력 2년
                이상의 분들만 참여 가능합니다.
              </li>
              <li>차량 시승 기간 중 총 주행 가능 거리는 300Km로 제한됩니다.</li>
              <li>
                시승 기간 중 발생한 통행료, 과태료, 범칙금은 시승 고객 본인
                부담입니다.
              </li>
              <li>시승 신청자에게 휴대폰 문자로 상세 안내 예정입니다.</li>
            </ol>
          </article>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
