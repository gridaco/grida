"use client";

import React from "react";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
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
import { Check } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { mutate } from "swr";
import { TicketCheckIcon } from "lucide-react";
import toast from "react-hot-toast"; // Import toast
import * as Standard from "../standard";
import t from "./data-01.json";

function __share_obj({
  campaign_slug,
  referrer_name,
  invitation_code,
}: {
  campaign_slug: string;
  referrer_name: string;
  invitation_code: string;
}) {
  return {
    title: "Polestar 시승하고 경품 받아가세요 🎁",
    text: `${referrer_name} 님 께서 Polestar 시승 이벤트에 초대합니다!`,
    url: `${window.location.origin}/r/${campaign_slug}/t/${invitation_code}`,
  };
}

async function mkshare({
  campaign_slug,
  referrer_code,
  referrer_name,
}: {
  campaign_slug: string;
  referrer_code: string;
  referrer_name: string;
}) {
  const client = new Platform.WEST.Referral.WestReferralClient(campaign_slug);
  const { data: invitation } = await client.invite(referrer_code);

  return __share_obj({
    campaign_slug: campaign_slug,
    referrer_name,
    invitation_code: invitation.code,
  });
}

async function reshare({
  campaign_slug,
  referrer_code,
  referrer_name,
  invitation_id,
}: {
  campaign_slug: string;
  referrer_code: string;
  referrer_name: string;
  invitation_id: string;
}) {
  const client = new Platform.WEST.Referral.WestReferralClient(campaign_slug);

  const { data: invitation } = await client.refresh(
    referrer_code,
    invitation_id
  );

  return __share_obj({
    campaign_slug: campaign_slug,
    referrer_name,
    invitation_code: invitation.code,
  });
}

async function share_or_copy(sharable: {
  title: string;
  text: string;
  url: string;
}): Promise<{ type: "clipboard" | "share" }> {
  if (navigator.share) {
    await navigator.share(sharable);
    return { type: "share" };
  } else {
    const shareUrl = sharable.url;
    const shareText = sharable.text;
    const shareTitle = sharable.title;
    const shareContent = `${shareTitle}\n${shareText}\n${shareUrl}`;
    await navigator.clipboard.writeText(shareContent);
    return { type: "clipboard" };
  }
}

export default function ReferrerPage({
  data,
}: {
  data: Platform.WEST.Referral.ReferrerPublicRead;
}) {
  const confirmDialog = useDialogState("confirm");
  const {
    code,
    campaign,
    referrer_name: _referrer_name,
    invitation_count,
    invitations,
    // children: subtokens,
  } = data;
  const referrer_name = _referrer_name || "?";

  const { max_invitations_per_referrer: max_supply } = campaign;

  const available_count = (max_supply ?? 0) - (invitation_count ?? 0);
  const is_available = available_count > 0;

  const triggerShare = async () => {
    return mkshare({
      campaign_slug: campaign.slug,
      referrer_code: code!,
      referrer_name,
    }).then((sharable) => {
      share_or_copy(sharable)
        .then(({ type }) => {
          switch (type) {
            case "share":
              toast.success("초대권이 발급되었습니다!");
              break;
            case "clipboard":
              toast.success("초대권이 복사되었습니다!");
              break;
          }
        })
        .finally(() => {
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
            <Standard.Header>
              {/* <Standard.Logo
                srcLight="https://www.polestar.com/w3-assets/favicon-32x32.png"
                srcDark="https://www.polestar.com/w3-assets/favicon-32x32.png"
                alt="logo"
                width={400}
                height={200}
                className="h-10 w-auto object-contain"
              /> */}
              <PolestarTypeLogo />
            </Standard.Header>
            {/* Main Image */}
            <Standard.Section className="pb-4">
              <Standard.MainImage
                src={t.hero.media.src}
                alt={t.hero.media.alt}
              />
            </Standard.Section>
            <Standard.Section className="py-4">
              <Standard.Title>시승 초대 하고 경품 받기</Standard.Title>
              <span className="text-sm text-muted-foreground">
                {referrer_name} 고객님의 Polestar 4 시승 추천 페이지입니다.
              </span>
              <Standard.BrandHostChip
                logo={{
                  src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
                  srcDark:
                    "https://www.polestar.com/w3-assets/favicon-32x32.png",
                }}
                name="Polestar"
              />
            </Standard.Section>
            <Standard.Section className="py-4">
              <Card className="relative overflow-hidden rounded-xl border-0">
                <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                <div className="px-4 py-1.5 m-0.5 relative border border-background rounded-t-[10px] overflow-hidden flex items-center z-10">
                  {/* background */}
                  <div className="absolute inset-0 bg-gradient-to-bl from-[#A07CFE] to-[#FFBE7B] opacity-30" />
                  <div className="z-10 flex items-center gap-2">
                    <TicketCheckIcon className="size-5" />
                    <span className="text-sm font-medium">
                      {referrer_name}님의 초대권
                    </span>
                  </div>
                </div>
                <CardHeader className="px-4 py-4">
                  <span className="text-xl font-bold">
                    {available_count > 0 ? (
                      <span>
                        <NumberFlow value={available_count} suffix="장 남음" />
                        <span className="ms-1 text-xs text-muted-foreground font-normal">
                          (총 {max_supply}장 중 {invitation_count}장 사용)
                        </span>
                      </span>
                    ) : (
                      <span>
                        모두 사용
                        <span className="ms-1 text-xs text-muted-foreground font-normal">
                          (총 {max_supply}장 중 {invitation_count}장 사용)
                        </span>
                      </span>
                    )}
                  </span>
                </CardHeader>
                <hr />
                <CardContent className="px-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    {referrer_name}님께 제공된 초대권을 사용해 지인에게 시승
                    이벤트를 공유하세요.
                  </p>
                </CardContent>
                {is_available && (
                  <CardFooter className="px-4 pb-4">
                    {/* CTA Button */}
                    <Button
                      onClick={confirmDialog.openDialog}
                      className="w-full"
                      size="lg"
                    >
                      {t.cta.label}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </Standard.Section>

            <Standard.Section>
              <Card className="relative overflow-hidden rounded-xl py-2 border-0">
                {invitations?.map((inv, index) => (
                  <motion.div
                    key={inv.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <div className="overflow-hidden transition-all">
                      <CardContent className="px-4 py-2">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div className="max-w-[180px] font-medium truncate text-muted-foreground">
                              {"#" + (index + 1)}
                            </div>
                            {inv.is_claimed ? (
                              <div className="flex items-center gap-2">
                                <Avatar className="size-10">
                                  <AvatarFallback>
                                    {inv.invitee_name?.charAt(0) ?? "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-semibold">
                                  {inv.invitee_name ?? "?"}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Avatar className="size-10">
                                  <AvatarFallback>?</AvatarFallback>
                                </Avatar>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    reshare({
                                      campaign_slug: campaign.slug,
                                      referrer_code: code!,
                                      referrer_name,
                                      invitation_id: inv.id,
                                    }).then((sharable) => {
                                      share_or_copy(sharable).then(
                                        ({ type }) => {
                                          //
                                          switch (type) {
                                            case "share":
                                              toast.success(
                                                "초대권이 재전송 되었습니다!"
                                              );
                                              break;
                                            case "clipboard":
                                              toast.success(
                                                "초대권이 복사되었습니다!"
                                              );
                                              break;
                                          }
                                        }
                                      );
                                    });
                                  }}
                                >
                                  다시 전송
                                </Button>
                              </div>
                            )}
                          </div>
                          <StatusIndicator invitation={inv} />
                        </div>
                      </CardContent>
                    </div>
                  </motion.div>
                ))}
              </Card>
            </Standard.Section>

            <Standard.Section>
              <header className="border-b py-2 my-4 text-sm text-muted-foreground">
                이벤트 안내
              </header>

              <article className="prose prose-sm dark:prose-invert">
                <h2>🏆 Polestar 4 시승 추천 하고 경품 받아게세요</h2>
                <Card className="py-6 px-6">
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
                      <br /> 초대권을 통해 지인의 시승 완료 시, 출고 고객과
                      시승자 본인 모두 혜택 제공 (최대 3인까지 제공)
                    </p>
                  </div>
                </Card>
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
              privacy="/privacy"
              instagram="https://www.instagram.com/polestarcars/"
              paragraph={
                "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100"
              }
            />
          </main>
          <ConfirmDrawer {...confirmDialog.props} onConfirm={triggerShare} />
        </ScreenScrollable>
      </ScreenMobileFrame>
    </ScreenRoot>
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
              {busy && <Spinner className="me-2" />}
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
    is_claimed: boolean;
  };
}) {
  // if (invitation.is_burned) {
  //   return (
  //     <Badge className="bg-white text-amber-600 hover:bg-white flex items-center gap-1 font-medium">
  //       <Gift className="h-3 w-3" />
  //       미션 완료
  //     </Badge>
  //   );
  // }

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
