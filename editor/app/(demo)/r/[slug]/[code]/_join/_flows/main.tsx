"use client";

import React from "react";
import { CountdownTimer } from "../../../../timer";
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
import t from "./data-01.json";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ScreenMobileFrame,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { Platform } from "@/lib/platform";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { TicketCheckIcon } from "lucide-react";
import { ShineBorder } from "@/www/ui/shine-border";
import Link from "next/link";

interface TokenPublicData {
  host: {
    name: string;
  };
}

interface GuestForm {
  name: string;
  phone: string;
}

const external_link =
  "https://www.polestar.com/kr/test-drive/booking/ps4/at-polestar";

export default function Main({
  token,
}: {
  token: Platform.WEST.Token<TokenPublicData>;
}) {
  const router = useRouter();
  const referrername = token.public.host.name;

  const onClaim = async (geust: GuestForm) => {
    // FIXME:
    const formid = "d040b4d2-4a48-460d-afb0-b425f63d6a63";
    const formdata = new FormData();
    formdata.append("name", geust.name);
    formdata.append("phone", geust.phone);
    const submission = await fetch(`/submit/${formid}`, {
      method: "POST",
      body: formdata,
    }).then((res) => {
      return res.json();
    });

    const customer_id = submission.data.customer_id;

    const client = new Platform.WEST.WestClient(token.series_id);
    const ok = await client.claim(token.code, customer_id);
    if (ok) {
      toast.success("이벤트 참여가 완료되었습니다.");
      router.replace(external_link);
    } else {
      toast.error("이벤트 참여에 실패했습니다.");
    }
  };

  if (token.is_burned) {
    return <>Already used.</>;
  }

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
              src={t.hero.media.src}
              alt={t.hero.media.alt}
              className="object-cover aspect-square @4xl:aspect-video select-none pointer-events-none w-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-8 left-8">
              <h2 className="text-2xl text-white">
                <span dangerouslySetInnerHTML={{ __html: t.hero.title }} />
              </h2>
            </div>
          </div>

          {/* Countdown Timer */}
          {!token.is_claimed && (
            <div className="flex justify-center items-center py-12 px-4">
              <CountdownTimer />
            </div>
          )}

          {!token.is_claimed && (
            <div className="my-10 mx-4">
              <Card className="relative overflow-hidden">
                <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TicketCheckIcon className="size-5" />
                    {referrername}님의 초대{" "}
                    {token.is_claimed ? "(수락 완료)" : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {referrername}님으로부터 초대를 받았습니다. <br />
                    이벤트 참여 시 {referrername}님과 이벤트 참여자 모두에게
                    경품이 지급됩니다.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {!token.is_claimed && (
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
              <ApplicantForm
                onSubmit={(guest) => {
                  onClaim(guest);
                }}
              />
            </Card>
          )}

          {token.is_claimed && !token.is_burned && (
            <div className="my-10 mx-4">
              <Card className="relative overflow-hidden">
                <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TicketCheckIcon className="size-5" />
                    시승 확인중
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    이벤트 참여가 완료되었습니다. 폴스타에서 시승을 완료해
                    주세요. 이후 문자를 통해 안내 드리겠습니다.
                    <br />
                    <br />
                    시승 신청을 완료하지 못하였나요?{" "}
                    <Link href={external_link} className="underline">
                      다시 신청하기
                    </Link>
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Info Section */}
          <div className="pt-12 pb-8 space-y-2 px-2">
            <article className="prose prose-sm dark:prose-invert">
              <span dangerouslySetInnerHTML={{ __html: t.info }} />
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
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const isFormValid = name.trim() !== "" && phone.trim() !== "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSubmit && isFormValid) {
      onSubmit({ name, phone });
    }
  };

  return (
    <form id="application" onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-semibold mb-6 text-center">
        시승 신청자 정보를 입력해주세요
      </h2>

      <div className="grid gap-2">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="홍길동"
          required
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="phone">핸드폰 번호</Label>
        <div className="grid gap-2">
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={13}
            type="tel"
            required
            placeholder="번호를 입력해주세요"
          />
        </div>
      </div>
      <hr className="my-4" />

      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={!isFormValid}
        onClick={() => {
          if (isFormValid) {
            setIsDrawerOpen(true);
          }
        }}
      >
        시승 신청하기
      </Button>
      <FinalConfirm open={isDrawerOpen} setOpen={setIsDrawerOpen} />
    </form>
  );
}

function FinalConfirm({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [checkedItems, setCheckedItems] = React.useState({
    first: false,
    second: false,
  });

  const handleCheckboxChange = (key: "first" | "second") => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const allChecked = checkedItems.first && checkedItems.second;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>시승 예약 전 꼭 확인해주세요</DrawerTitle>
          <DrawerDescription>
            모든 내용 확인 시 시승 예약이 가능합니다
          </DrawerDescription>
        </DrawerHeader>
        <ChecklistForm
          onCheckboxChange={handleCheckboxChange}
          checkedItems={checkedItems}
          className="p-4"
        />
        <DrawerFooter className="pt-2">
          <Button form="application" type="submit" disabled={!allChecked}>
            다음으로
          </Button>
          <DrawerClose asChild>
            <Button variant="outline">이전으로</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ChecklistForm({
  className = "",
  onCheckboxChange,
  checkedItems,
}: {
  className?: string;
  onCheckboxChange: (key: "first" | "second") => void;
  checkedItems: { first: boolean; second: boolean };
}) {
  return (
    <div className={`${className} grid gap-4`}>
      <label className="flex items-start gap-2">
        <Checkbox
          checked={checkedItems.first}
          onCheckedChange={() => onCheckboxChange("first")}
        />
        <span className="text-sm text-muted-foreground">
          개인정보 수집에 동의합니다. (응모자 식별 정보: 이름, 연락처)
        </span>
      </label>
      <label className="flex items-start gap-2">
        <Checkbox
          checked={checkedItems.second}
          onCheckedChange={() => onCheckboxChange("second")}
        />
        <span className="text-sm text-muted-foreground">
          반드시 현재 입력하신 시승 신청자 정보와 동일한 <br /> &quot;이름과
          핸드폰 번호&quot;로 시승 예약을 해야 이벤트 참여가 인정됩니다.
        </span>
      </label>
    </div>
  );
}
