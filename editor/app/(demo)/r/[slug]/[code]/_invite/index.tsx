"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import t from "./data-01.json";
import toast from "react-hot-toast"; // Import toast
import { PolestarTypeLogo } from "@/components/logos";
import { Checkbox } from "@/components/ui/checkbox"; // Adjust import according to your UI library
import { Platform } from "@/lib/platform";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { ShineBorder } from "@/www/ui/shine-border";
import NumberFlow from "@number-flow/react";
import { motion } from "motion/react";
import { Badge } from "@/components/ui/badge";
import { Check, Gift } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mutate } from "swr";

async function mkshare(token: Platform.WEST.TokenPublicRead["token"]) {
  const client = new Platform.WEST.WestClient(token.series_id);
  const { data: next } = await client.mint(token.code);

  return {
    title: "Polestar 2",
    text: `${token.owner.name}`,
    url: `${window.location.origin}/r/${next.series_id}/${next.code}`,
  };
}

async function reshare(
  owner: Platform.WEST.TokenPublicRead["token"]["owner"],
  token: Platform.WEST.TokenPublicRead["children"][0]
) {
  return {
    title: "Polestar 2",
    text: `${owner.name}`,
    url: `${window.location.origin}/r/${token.series_id}/${token.code}`,
  };
}

export default function Invite({
  data,
}: {
  data: Platform.WEST.TokenPublicRead;
}) {
  const confirmDialog = useDialogState("confirm");
  const { token, children: subtokens } = data;

  const { max_supply, count, owner } = token;

  const available_count = (max_supply ?? 0) - count;
  const is_available = available_count > 0;

  const triggerShare = async () => {
    // Added onshareclick function
    if (!navigator.share) {
      toast.error("이 기능은 현재 사용중인 브라우저에서 지원되지 않습니다.");
      return;
    }

    return mkshare(token).then((sharable) => {
      navigator
        .share(sharable)
        .then(() => {
          // setSupply((supply) => supply - 1);
          toast.success("초대권이 발급되었습니다!"); // Updated alert to toast
        })
        .catch((e) => {
          console.log("error while sharing", e);
        })
        .finally(() => {
          const code = token.code;
          mutate(code);
          confirmDialog.closeDialog();
        });
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
                src={t.hero.media.src}
                alt={t.hero.media.alt}
                className="object-cover aspect-square select-none pointer-events-none w-full"
              />
              {/* overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-8 left-8">
                <h2 className="text-2xl text-white">
                  {/* <span
                      dangerouslySetInnerHTML={{ __html: data.hero.title }}
                    /> */}
                  {owner.name}님을 <br />
                  Polestar 4 시승 초대 이벤트에 <br />
                  초대드립니다.
                </h2>
              </div>
            </div>

            <Card className="mt-12 mx-4 py-6 px-6">
              <div className="space-y-4">
                <Badge variant="outline">Polestar 시승 완료 시 혜택</Badge>
                <p className="text-xl font-semibold">
                  TMAP EV 충전 포인트 10만원 <br />
                  <span className="text-sm text-muted-foreground">
                    (시승 완료자 1인당 10만원권 / 최대 3인까지)
                  </span>
                </p>

                <p className="text-sm font-light text-muted-foreground">
                  • 대상 : 2025년 출고 고객
                  <br /> 초대권을 통해 지인의 시승 완료 시, 출고 고객과 시승자
                  본인 모두 혜택 제공 (최대 3인까지 제공)
                </p>
              </div>
            </Card>

            <div className="mt-10 mx-4">
              <Card className="relative overflow-hidden">
                <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                <CardHeader>
                  <CardTitle>{owner.name}님의 초대권</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-lg font-bold">
                    {available_count > 0 ? (
                      <span>
                        <NumberFlow value={available_count} suffix="장 남음" />
                        <span className="ms-1 text-xs text-muted-foreground font-normal">
                          (총 {max_supply}장 중 {count}장 사용)
                        </span>
                      </span>
                    ) : (
                      <>모두 소진</>
                    )}
                  </span>
                  <hr className="my-4" />
                  <p className="text-sm text-muted-foreground">
                    {owner.name}님께 제공된 초대권을 사용해 지인에게 시승
                    이벤트를 공유하세요. 시승 완료 시 {owner.name}님과 시승
                    완료자 모두에게 특별한 혜택이 제공됩니다.
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="mt-12 mx-4 space-y-2">
              {subtokens.map((subtoken, index) => (
                <motion.div
                  key={subtoken.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="overflow-hidden transition-all border">
                    <CardContent className="px-4 py-2">
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <div className="font-medium truncate max-w-[180px]">
                            {"#" + (index + 1)}
                          </div>
                          {subtoken.owner ? (
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarFallback>
                                  {subtoken.owner?.name?.charAt(0) ?? "?"}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-semibold">
                                {subtoken.owner?.name}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarFallback>?</AvatarFallback>
                              </Avatar>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  //
                                  reshare(owner, subtoken).then((sharable) => {
                                    navigator
                                      .share(sharable)
                                      .then(() => {
                                        toast.success(
                                          "초대권이 재전송 되었습니다!"
                                        );
                                      })
                                      .catch((e) => {
                                        console.log("error while sharing", e);
                                      });
                                  });
                                }}
                              >
                                다시 전송
                              </Button>
                            </div>
                          )}
                        </div>
                        <StatusIndicator invitation={subtoken} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Info Section */}
            <div className="pt-12 pb-8 space-y-2">
              <article className="prose prose-sm dark:prose-invert">
                <span dangerouslySetInnerHTML={{ __html: t.info }} />
              </article>
            </div>
            <div className="flex justify-center items-center pb-8 px-4">
              <FaQ />
            </div>

            <div className="flex-1" />
            {/* CTA Button */}
            {is_available && (
              <footer className="sticky bottom-0 mt-auto left-0 right-0 bg-background p-4 border-t">
                <Button
                  onClick={confirmDialog.openDialog}
                  className="w-full"
                  size="lg"
                >
                  {t.cta.label}
                </Button>
              </footer>
            )}
          </main>
          <ConfirmDrawer {...confirmDialog.props} onConfirm={triggerShare} />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
  );
}

function FaQ() {
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

function ConfirmDrawer({
  onConfirm,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  onConfirm: () => Promise<void>;
}) {
  const [confirmed, setConfirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const onConfirmClick = async () => {
    setBusy(true);
    onConfirm().finally(() => {
      setBusy(false);
    });
  };

  return (
    <Drawer {...props}>
      <DrawerContent>
        <div className="mx-auto w-full">
          <DrawerHeader className="text-left">
            <DrawerTitle>시승 초대 전 꼭 확인해주세요</DrawerTitle>
            <hr />
            <DrawerDescription>
              <ul className="list-disc pl-4">
                <li>
                  시승 초대하기가 완료되면 초대권 1장이 차감되며, 차감된
                  초대권은 복구되지 않습니다.
                </li>
                <li>
                  3명 이상이 시승을 완료해도 최대 3명까지만 인정되어 혜택이
                  제공됩니다.
                </li>
                <li>
                  본 이벤트 페이지를 통해 초대된 고객이 시승을 완료해야만 참여로
                  인정됩니다.
                </li>
              </ul>
            </DrawerDescription>
          </DrawerHeader>
          <section className="p-4 ">
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2">
                <Checkbox
                  id="confirm-check"
                  onCheckedChange={(checked) => setConfirmed(!!checked)}
                />
                <span className="text-sm text-muted-foreground">
                  위 내용을 확인하였습니다
                </span>
              </label>
            </div>
          </section>
          <DrawerFooter className="pt-2">
            <Button onClick={onConfirmClick} disabled={!confirmed || busy}>
              {busy && <Spinner />}
              초대장 보내기
            </Button>
            <DrawerClose asChild>
              <Button variant="outline">취소</Button>
            </DrawerClose>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function StatusIndicator({
  invitation,
}: {
  invitation: {
    is_burned: boolean;
    is_claimed: boolean;
  };
}) {
  if (invitation.is_burned) {
    return (
      <Badge className="bg-white text-amber-600 hover:bg-white flex items-center gap-1 font-medium">
        <Gift className="h-3 w-3" />
        미션 완료
      </Badge>
    );
  }

  if (invitation.is_claimed) {
    return (
      <Badge className="bg-white text-green-600 hover:bg-white flex items-center gap-1 font-medium">
        <Check className="h-3 w-3" />
        초대 수락
      </Badge>
    );
  }

  return (
    <Badge className="bg-white/80 text-blue-600 hover:bg-white flex items-center gap-1 font-medium">
      초대 완료
    </Badge>
  );
}
