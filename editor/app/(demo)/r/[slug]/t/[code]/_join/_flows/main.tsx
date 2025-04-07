"use client";

import React from "react";
// import { CountdownTimer } from "../../timer";
import { useState } from "react";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import NumberFlow from "@number-flow/react";
import t from "./data-01.json";
import {
  Drawer,
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
import {
  SYSTEM_GF_CUSTOMER_NAME_KEY,
  SYSTEM_GF_CUSTOMER_PHONE_KEY,
} from "@/k/system";
import { PhoneInput } from "@/components/extension/phone-input";
import { Spinner } from "@/components/spinner";
import * as Standard from "@/theme/templates/west-referral/standard";
import { useDialogState } from "@/components/hooks/use-dialog-state";

interface CampaignPublicData {
  "signup-form-id": string;
}

interface GuestForm {
  name: string;
  phone: string;
}

const external_link =
  "https://www.polestar.com/kr/test-drive/booking/ps4/at-polestar";

export default function Main({
  data,
  visible,
}: {
  visible: boolean;
  data: Platform.WEST.Referral.InvitationPublicRead;
}) {
  const { code, campaign, referrer_name, is_claimed } = data;
  const router = useRouter();

  const signupformDialog = useDialogState("signupform");

  const onClaim = async (geust: GuestForm) => {
    const formid = (campaign.public as CampaignPublicData)["signup-form-id"];
    const formdata = new FormData();
    formdata.append(SYSTEM_GF_CUSTOMER_NAME_KEY, geust.name);
    formdata.append(SYSTEM_GF_CUSTOMER_PHONE_KEY, geust.phone);
    const submission = await fetch(`/submit/${formid}`, {
      method: "POST",
      body: formdata,
    }).then((res) => {
      return res.json();
    });

    const customer_id = submission.data.customer_id;

    const client = new Platform.WEST.Referral.WestReferralClient(campaign.slug);
    const ok = await client.claim(code, customer_id);
    if (ok) {
      toast.success("이벤트 참여신청이 완료되었습니다.");
      router.replace(external_link);
    } else {
      toast.error("이벤트 참여에 실패했습니다.");
    }
  };

  // if (token.is_burned) {
  //   return <>Already used.</>;
  // }

  const reward_value = 100000;
  const reward_currency = "KRW";
  const reward_description = "TMAP EV 충전 포인트";
  const reward_currency_valid = reward_currency.length === 3;

  return (
    <ScreenMobileFrame>
      <ScreenScrollable>
        <div>
          {/* Header */}
          <Standard.Header>
            <Standard.Logo
              src={"/logos/polestar.png"}
              srcDark={"/logos/polestar-dark.png"}
              alt="logo"
              width={320}
              height={64}
              className="max-h-8 w-auto object-contain"
            />
          </Standard.Header>

          {/* Main Image */}
          <Standard.Section className="pb-4">
            <Standard.MainImage src={t.hero.media.src} alt={t.hero.media.alt} />
          </Standard.Section>

          <Standard.Section className="py-4">
            <Standard.Title>{t.hero.title}</Standard.Title>
            <span className="text-sm text-muted-foreground">
              {referrer_name}님 께서 Polestar 4 를 추천 했습니다.
            </span>
            <Standard.BrandHostChip
              logo={{
                src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
                srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
              }}
              name="Polestar"
            />
          </Standard.Section>

          {/* Countdown Timer */}
          {/* {!is_claimed && (
            <div className="flex justify-center items-center py-12 px-4">
              <CountdownTimer />
            </div>
          )} */}

          <Standard.Section>
            <Card className="relative overflow-hidden rounded-xl border-0">
              <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
              <div className="px-4 py-1.5 m-0.5 relative border border-background rounded-t-[10px] overflow-hidden flex items-center z-10">
                {/* background */}
                <div className="absolute inset-0 bg-gradient-to-bl from-[#A07CFE] to-[#FFBE7B] opacity-30" />
                <div className="z-10 flex items-center gap-2">
                  <TicketCheckIcon className="size-5" />
                  <span className="text-sm font-medium">
                    {referrer_name}님의 초대
                  </span>
                </div>
              </div>
              <CardHeader className="px-4 py-4">
                <span>
                  <span className="text-xl font-bold">
                    <NumberFlow
                      value={visible ? reward_value : reward_value * 0.01}
                      format={{
                        style: reward_currency_valid ? "currency" : undefined,
                        currency: reward_currency_valid
                          ? reward_currency
                          : undefined,
                      }}
                    />
                    <span className="ms-1 text-xs text-muted-foreground font-normal">
                      {reward_description}
                    </span>
                  </span>
                </span>
              </CardHeader>
              <hr />
              <CardContent className="px-4 py-4">
                <p className="text-sm text-muted-foreground">
                  {referrer_name}님으로부터 초대를 받았습니다. <br />
                  이벤트 참여 시 {referrer_name}님과 이벤트 참여자 모두에게
                  경품이 지급됩니다.
                </p>
              </CardContent>
              {!is_claimed && (
                <CardFooter className="px-4 pb-4">
                  {/* CTA Button */}
                  <Button
                    onClick={signupformDialog.openDialog}
                    className="w-full"
                    size="lg"
                  >
                    {t.cta.label}
                  </Button>
                </CardFooter>
              )}
            </Card>

            {is_claimed && (
              <div className="my-4">
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
          </Standard.Section>

          <SignUpForm {...signupformDialog.props} onSubmit={onClaim} />

          <Standard.Section>
            <header className="border-b py-2 my-4 text-sm text-muted-foreground">
              이벤트 안내
            </header>
            <article className="prose prose-sm dark:prose-invert">
              <span dangerouslySetInnerHTML={{ __html: t.info }} />
              <h6>이벤트 FAQ</h6>
              <ul>
                <li>시승이 완료된 후 경품이 지급됩니다. </li>
                <li>
                  시승 신청자 본인에 한하여 시승 가능하며, 타인에게 양도할 수
                  없습니다.
                </li>
                <li>
                  운전면허 소지자 중 만 21세 이상 및 실제 도로 주행 경력 2년
                  이상의 분들만 참여 가능합니다.
                </li>
                <li>
                  차량 시승 기간 중 총 주행 가능 거리는 300Km로 제한됩니다.
                </li>
                <li>
                  시승 기간 중 발생한 통행료, 과태료, 범칙금은 시승 고객 본인
                  부담입니다.
                </li>
                <li>시승 신청자에게 휴대폰 문자로 상세 안내 예정입니다.</li>
              </ul>
            </article>
          </Standard.Section>
          <Standard.FooterTemplate
            logo={{
              src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
              srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
            }}
            links={[
              {
                href: "https://www.polestar.com/kr/legal/privacy-policy/",
                text: "개인정보 처리방침",
              },
              {
                href: "https://www.polestar.com/kr/legal/terms-and-conditions/",
                text: "이용약관",
              },
              {
                href: "https://www.polestar.com/kr/legal/terms-and-conditions/#terms-of-use-for-test-drive",
                text: "시승 이용약관",
              },
            ]}
            instagram="https://www.instagram.com/polestarcars/"
            paragraph={
              "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100"
            }
          />
        </div>
      </ScreenScrollable>
    </ScreenMobileFrame>
  );
}

function SignUpForm({
  onSubmit,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  onSubmit?: (data: { name: string; phone: string }) => Promise<void>;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const [step, setStep] = React.useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const steps = [
    { title: "시승 신청자 정보를 입력해주세요" },
    {
      title: "시승 예약 전 꼭 확인해주세요",
      description: "모든 내용 확인 시 시승 예약이 가능합니다",
    },
  ];

  const [checkedItems, setCheckedItems] = React.useState({
    first: false,
    second: false,
  });

  const step1valid = name.trim() !== "" && phone.trim() !== "";
  const step2valid = checkedItems.first && checkedItems.second;

  const canContinue = (step === 0 && step1valid) || (step === 1 && step2valid);

  const stepdata = steps[step];

  const handleSubmit = () => {
    if (onSubmit && step1valid && step2valid) {
      setIsBusy(true);
      onSubmit({ name, phone }).finally(() => {
        setIsBusy(false);
        props.onOpenChange?.(false);
        setStep(0);
      });
    }
  };

  const onNext = () => {
    const max = steps.length - 1;
    if (step < max) {
      setStep((prev) => prev + 1);
    } else {
      handleSubmit();
    }
  };

  const onPrev = () => {
    if (step > 0) {
      setStep((prev) => prev - 1);
    } else {
      props.onOpenChange?.(false);
    }
  };

  const onCheckboxChange = (key: "first" | "second") => {
    setCheckedItems((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Drawer {...props}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{stepdata.title}</DrawerTitle>
          <DrawerDescription>{stepdata.description}</DrawerDescription>
        </DrawerHeader>
        <div className="px-4 my-4">
          {step === 0 && (
            <div className="grid gap-4">
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
                  <PhoneInput
                    id="phone"
                    defaultCountry="KR"
                    placeholder="01012345678"
                    required
                    value={phone}
                    onChange={(phone) => setPhone(phone)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4">
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
                  반드시 현재 입력하신 시승 신청자 정보와 동일한 <br />{" "}
                  &quot;이름과 핸드폰 번호&quot;로 시승 예약을 해야 이벤트
                  참여가 인정됩니다.
                </span>
              </label>
            </div>
          )}
        </div>
        <DrawerFooter className="pt-2">
          <div className="w-full flex items-center gap-2">
            <Button variant="outline" onClick={onPrev}>
              이전으로
            </Button>
            <Button
              onClick={onNext}
              disabled={!canContinue || isBusy}
              className="w-full"
            >
              {isBusy ? (
                <>
                  <Spinner className="me-2" />
                  신청중...
                </>
              ) : (
                <>다음으로</>
              )}
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
