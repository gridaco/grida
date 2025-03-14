"use client";

import React from "react";
import { CountdownTimer } from "../../../timer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PolestarTypeLogo } from "@/components/logos";
// import data from "./data.json";
import data from "./data-01.json";
import Link from "next/link";
import { ACME } from "@/components/logos/acme";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ScreenMobileFrame,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { CampaignData } from "../../../data";

export default function Main({ data: d }: { data: CampaignData }) {
  return (
    <ScreenMobileFrame>
      <ScreenScrollable>
        <div>
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
              className="object-cover aspect-square @4xl:aspect-video select-none pointer-events-none w-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-8 left-8">
              <h2 className="text-2xl text-white">
                <span dangerouslySetInnerHTML={{ __html: data.hero.title }} />
              </h2>
            </div>
          </div>

          <div className="mt-10 mx-4">
            <Card>
              <CardHeader>
                <CardTitle>{d.user.name}님 의 초대</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {d.user.name}님 으로 부터 초대를 받았습니다. 이벤트 참여시
                  {d.user.name}과 참여자분 모두에게 경품이 지급됩니다.
                </p>
              </CardContent>
            </Card>
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
          <div className="pt-12 pb-8 space-y-2 px-2">
            <article className="prose prose-sm dark:prose-invert">
              <span dangerouslySetInnerHTML={{ __html: data.info }} />
            </article>
          </div>
          <div className="flex justify-center items-center pb-8 px-4">
            <AccordionDemo />
          </div>

          {/* CTA Button */}
          <footer className="sticky border-t bottom-0 left-0 right-0 bg-background p-4 shadow-t">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full" size="lg">
                  {data.cta.label}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>시승 신청하러 가기</AlertDialogTitle>
                  {/* <AlertDialogDescription>
                이메일 주소를 입력해 주세요
              </AlertDialogDescription> */}
                  <form className="py-10 grid gap-5">
                    <div className="grid gap-1.5">
                      <label className="text-sm">
                        이메일 주소를 입력해 주세요.
                      </label>
                      <Input
                        type="email"
                        required
                        placeholder="alice@gmail.com"
                      />
                      <label className="text-xs text-muted-foreground">
                        폴스타 시승 신청 페이지에도 동일한 이메일 주소를 입력해
                        주셔야 응모에 참여됩니다.
                      </label>
                    </div>
                    <label className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4 shadow">
                      <Checkbox required />
                      <div className="space-y-1 leading-none">
                        <span className="text-sm">
                          개인정보 수집에 동의합니다. (응모자 식별 정보: 이메일)
                        </span>
                        <p className="text-xs text-muted-foreground">
                          폴스타 시승 신청 페이지로 이동후, 반드시 동일한
                          이메일로 시승 신청을 완료해 주세요. 이메일 주소는
                          응모자 식별 이외로 사용하지 않습니다.
                        </p>
                      </div>
                    </label>
                  </form>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel asChild>
                    <Button variant="ghost">나중에 하기</Button>
                  </AlertDialogCancel>
                  <AlertDialogAction asChild>
                    <Link href={data.cta.link} target="_blank">
                      신청하러 가기
                    </Link>
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </footer>
        </div>
      </ScreenScrollable>
    </ScreenMobileFrame>
  );
}

function AccordionDemo() {
  return (
    <Accordion type="single" collapsible className="w-full">
      <AccordionItem value="item-1">
        <AccordionTrigger className="text-base font-normal">
          위치 안내
        </AccordionTrigger>
        <AccordionContent>
          {" "}
          <PolestarLocation />{" "}
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="item-2">
        <AccordionTrigger className="text-base font-normal">
          이벤트 FAQ
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
      <div className="flex flex-col gap-2 p-4 w-[250px] border rounded-md">
        <p className="font-medium">Polestar 경기</p>
        <span className="text-xs text-muted-foreground">
          대한민국 경기도 하남시 신장동 미사대로 750
        </span>
      </div>
      <div className="flex flex-col gap-2 p-4 w-[250px] border rounded-md">
        <p className="font-medium">Polestar 부산</p>
        <span className="text-xs text-muted-foreground">
          대한민국 부산광역시 해운대구 센텀4로 15 센텀시티 몰 1층
        </span>
      </div>
    </div>
  );
}
