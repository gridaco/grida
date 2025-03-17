"use client";

import React from "react";
import { CountdownTimer } from "../../../timer";
import { useState } from "react";
import { Label } from "@/components/ui/label";
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
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  // Check if all fields are filled to enable the button
  const isFormValid = name.trim() !== "" && phone.trim() !== "" && agreed;

  const handleSubmit = () => {
    if (isFormValid) {
      window.location.href = data.cta.link; // Redirect to external page
    }
  };

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

          {/* Countdown Timer */}
          <div className="flex justify-center items-center py-12 px-4">
            <CountdownTimer />
          </div>

          {/* Stats Grid */}
          <Card className="mx-4 py-6 px-6">
            {/* {data.perks.map((perk, index) => ( */}
            {/* <div key={index} className="text-center"> */}
            <div className="text-center">
              <p className=" font-medium">Polestar 시승 완료 시 혜택</p>
              <p className="text-xl font-semibold">
                TMAP EV 충전 포인트 10만원
              </p>

              <p className="text-sm font-light mt-2 text-muted-foreground">
                시승 신청자 본인에 한함 <br />
                이벤트 기간 : 2025년 00월 00일까지
              </p>
            </div>
            <hr className="my-8" />
            <ApplicantForm />
          </Card>
          <div className="mt-10 mx-4">
            <Card>
              <CardHeader>
                <CardTitle>{d.user.name}님의 초대</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {d.user.name}님으로부터 초대를 받았습니다. <br />
                  이벤트 참여 시 {d.user.name}님과 이벤트 참여자 모두에게 경품이
                  지급됩니다.
                </p>
              </CardContent>
            </Card>
          </div>

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
          {/* <footer className="sticky border-t bottom-0 left-0 right-0 bg-background p-4 shadow-t">
            <Link href={data.cta.link} target="_blank">
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!isFormValid}
              >
                시승 신청하기
              </Button>
            </Link>
          </footer> */}
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

function ApplicantForm({
  onSubmit,
}: {
  onSubmit?: (data: { name: string; phone: string }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed1, setAgreed1] = useState(false);
  const [agreed2, setAgreed2] = useState(false);
  const isFormValid =
    name.trim() !== "" && phone.trim() !== "" && agreed1 && agreed2;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit && isFormValid) {
      onSubmit({ name, phone });
    }
  };

  const handlePhoneInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");

    // Format as 010-0000-0000
    if (value.length > 3 && value.length <= 7) {
      value = `${value.slice(0, 3)}-${value.slice(3)}`;
    } else if (value.length > 7) {
      value = `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7, 11)}`;
    }

    setPhone(value);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-semibold mb-6 text-center">
        시승 신청자 정보를 입력해주세요
      </h2>

      <div className="grid grid-cols-[80px_1fr] items-center gap-4">
        <Label htmlFor="name" className="text-base font-medium">
          이름
        </Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-gray-300"
          placeholder="홍길동"
          required
        />
      </div>

      <div className="grid grid-cols-[80px_1fr] items-center gap-4">
        <Label htmlFor="phone" className="text-base font-medium">
          휴대폰 번호
        </Label>
        <div className="grid gap-2">
          <Input
            id="phone"
            value={phone}
            onChange={handlePhoneInput}
            className="border-gray-300"
            maxLength={13}
            inputMode="numeric"
            required
            placeholder="번호를 입력해주세요"
          />
        </div>
      </div>
      <hr className="my-4" />
      <div className="flex flex-col gap-1">
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={agreed1}
              onCheckedChange={(checked) => setAgreed1(!!checked)}
            />
            <span className="text-sm text-muted-foreground">
              개인정보 수집에 동의합니다. (응모자 식별 정보: 이름, 연락처)
            </span>
          </label>
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-start gap-2">
            <Checkbox
              checked={agreed2}
              onCheckedChange={(checked) => setAgreed2(!!checked)}
            />
            <span className="text-sm text-muted-foreground">
              반드시 전에 입력하신 시승 신청자 정보와 동일한 <br /> &quot;이름과
              핸드폰 번호&quot;로 시승 예약을 해야 이벤트 참여가 인정됩니다.
            </span>
          </label>
        </div>
      </div>
      <Button
        type="submit"
        className="w-full"
        size="lg"
        disabled={!isFormValid}
      >
        시승 신청하기
      </Button>
    </form>
  );
}
