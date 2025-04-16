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
import { Checkbox } from "@/components/ui/checkbox";
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
import { template } from "@/utils/template";
import * as Standard from "../standard";
import toast from "react-hot-toast";

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
    // FIXME: content
    title: "Polestar 시승하고 경품 받아가세요 🎁",
    text: `${referrer_name} 님 께서 Polestar 시승 이벤트에 초대합니다!`,
    // FIXME: tenant url
    url: `${window.location.origin}/r/${campaign_slug}/t/${invitation_code}`,
  };
}

async function mkshare({
  client,
  campaign_slug,
  referrer_code,
  referrer_name,
}: {
  client?: Platform.WEST.Referral.WestReferralClient;
  campaign_slug: string;
  referrer_code: string;
  referrer_name: string;
}) {
  if (!client) throw new Error("client is not defined");
  const { data: invitation } = await client.invite(referrer_code);

  return __share_obj({
    campaign_slug: campaign_slug,
    referrer_name,
    invitation_code: invitation.code,
  });
}

async function reshare({
  client,
  campaign_slug,
  referrer_code,
  referrer_name,
  invitation_id,
}: {
  client?: Platform.WEST.Referral.WestReferralClient;
  campaign_slug: string;
  referrer_code: string;
  referrer_name: string;
  invitation_id: string;
}) {
  if (!client) throw new Error("client is not defined");
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

const dictionary = {
  en: {
    an_anonymous: "An Anonymous User",
    this_is_your_invitation: "{referrer_name}'s invitation",
    about_event: "About Event",
    tickets_remaining_suffix: " Left",
    tickets_remaining_all_used: "All Used",
    tickets_remaining_description:
      "(Used {invitation_count} out of {max_supply})",
    invite_description:
      "Hi {referrer_name}, Click the button below to share the event with your friends.",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    support: "Support",
    invitation_copied_to_clipboard: "Invitation code copied!",
    invitation_shared: "Invitation code sent!",
    invitation_shared_again: "Invitation code sent again!",
    resend: "Resend",
    invitation_status_sent: "Invited",
    invitation_status_accepted: "Accepted",
    invitation_status_completed: "Completed",
  },
  ko: {
    an_anonymous: "익명의 사용자",
    this_is_your_invitation: "{referrer_name}님의 초대권",
    about_event: "이벤트 안내",
    tickets_remaining_suffix: "장 남음",
    tickets_remaining_all_used: "모두 사용",
    tickets_remaining_description:
      "(총 {max_supply}장 중 {invitation_count}장 사용)",
    invite_description:
      "{referrer_name}님께 제공된 초대권을 사용해 지인에게 이벤트를 공유하세요.",
    privacy: "개인정보처리방침",
    terms: "이용약관",
    support: "고객센터",
    invitation_copied_to_clipboard: "초대권이 복사되었습니다",
    invitation_shared: "초대권이 발송되었습니다",
    invitation_shared_again: "초대권이 재전송 되었습니다",
    resend: "다시 전송",
    invitation_status_sent: "초대 완료",
    invitation_status_accepted: "수락됨",
    invitation_status_completed: "미션 완료",
  },
};

export interface Props {
  title: string;
  description?: string | null;
  brand_name?: string;
  logo?: {
    src: string;
    srcDark?: string;
    width?: number;
    height?: number;
  };
  favicon?: {
    src: string;
    srcDark?: string;
  };
  image?: {
    src: string;
    alt?: string;
  };
  cta: string;
  article?: {
    html: string;
  };
  footer?: {
    link_instagram?: string;
    link_privacy?: string;
    link_support?: string;
    link_terms?: string;
    paragraph?: { html: string };
  };
}

export default function ReferrerPageTemplate({
  data,
  design,
  slug,
  locale,
  client,
}: {
  data: Platform.WEST.Referral.ReferrerPublicRead;
  /**
   * @deprecated
   */
  slug: string;
  design: Props;
  locale: keyof typeof dictionary;
  client?: Platform.WEST.Referral.WestReferralClient;
}) {
  const t = dictionary[locale];
  const beforeShareDialog = useDialogState("before-share");
  const {
    code,
    campaign,
    referrer_name: _referrer_name,
    invitation_count,
    invitations,
  } = data;
  const referrer_name = _referrer_name || t.an_anonymous;

  const { max_invitations_per_referrer: max_supply } = campaign;

  const is_unlimited = max_supply === null;
  const available_count = (max_supply ?? Infinity) - (invitation_count ?? 0);
  const is_available = available_count > 0;

  const triggerShare = async () => {
    return mkshare({
      client: client,
      campaign_slug: slug,
      referrer_code: code!,
      referrer_name,
    }).then((sharable) => {
      share_or_copy(sharable)
        .then(({ type }) => {
          switch (type) {
            case "share":
              toast.success(t.invitation_shared);
              break;
            case "clipboard":
              toast.success(t.invitation_copied_to_clipboard);
              break;
          }
        })
        .finally(() => {
          mutate(code);
          beforeShareDialog.closeDialog();
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
              {design.logo && (
                <Standard.Logo
                  src={design.logo.src}
                  srcDark={design.logo.srcDark}
                  alt="logo"
                  width={design.logo.width ?? 320}
                  height={design.logo.height ?? 64}
                  className="max-h-8 w-auto object-contain"
                />
              )}
            </Standard.Header>
            {/* Main Image */}
            <Standard.Section className="pb-4">
              <Standard.MainImage
                src={design.image?.src}
                alt={design.image?.alt}
              />
            </Standard.Section>
            <Standard.Section className="py-4">
              <Standard.Title>{design.title}</Standard.Title>
              <span className="text-sm text-muted-foreground">
                {design.description}
              </span>
              {design.favicon && design.brand_name && (
                <Standard.BrandHostChip
                  logo={design.favicon}
                  name={design.brand_name}
                />
              )}
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
                      {template(t.this_is_your_invitation, {
                        referrer_name,
                      })}
                    </span>
                  </div>
                </div>
                {!is_unlimited && (
                  <CardHeader className="px-4 py-4 border-b">
                    <span className="text-xl font-bold">
                      {available_count > 0 ? (
                        <span>
                          <NumberFlow
                            value={available_count}
                            suffix={t.tickets_remaining_suffix}
                          />
                          <span className="ms-1 text-xs text-muted-foreground font-normal">
                            {template(t.tickets_remaining_description, {
                              max_supply: max_supply?.toString() ?? "",
                              invitation_count:
                                invitation_count?.toString() ?? "",
                            })}
                          </span>
                        </span>
                      ) : (
                        <span>
                          {t.tickets_remaining_all_used}
                          <span className="ms-1 text-xs text-muted-foreground font-normal">
                            {template(t.tickets_remaining_description, {
                              max_supply: max_supply?.toString() ?? "",
                              invitation_count:
                                invitation_count?.toString() ?? "",
                            })}
                          </span>
                        </span>
                      )}
                    </span>
                  </CardHeader>
                )}
                <CardContent className="px-4 py-4">
                  <p className="text-sm text-muted-foreground">
                    {template(t.invite_description, {
                      referrer_name,
                    })}
                  </p>
                </CardContent>
                {is_available && (
                  <CardFooter className="px-4 pb-4">
                    {/* CTA Button */}
                    <Button
                      onClick={beforeShareDialog.openDialog}
                      className="w-full"
                      size="lg"
                    >
                      {design.cta}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </Standard.Section>

            {invitations.length > 0 && (
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
                                        client: client,
                                        campaign_slug: slug,
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
                                                  t.invitation_shared_again
                                                );
                                                break;
                                              case "clipboard":
                                                toast.success(
                                                  t.invitation_copied_to_clipboard
                                                );
                                                break;
                                            }
                                          }
                                        );
                                      });
                                    }}
                                  >
                                    {t.resend}
                                  </Button>
                                </div>
                              )}
                            </div>
                            <StatusIndicator invitation={inv} locale={locale} />
                          </div>
                        </CardContent>
                      </div>
                    </motion.div>
                  ))}
                </Card>
              </Standard.Section>
            )}

            <Standard.Section>
              <header className="border-b py-2 my-4 text-sm text-muted-foreground">
                {t.about_event}
              </header>

              {design.article && (
                <article className="prose prose-sm dark:prose-invert">
                  <span
                    dangerouslySetInnerHTML={{ __html: design.article.html }}
                  />
                </article>
              )}
            </Standard.Section>
            {design.footer && (
              <Standard.FooterTemplate
                logo={design.favicon}
                links={[
                  {
                    href: design.footer.link_privacy ?? "/privacy",
                    text: t.privacy,
                  },
                  {
                    href: design.footer.link_terms ?? "/terms",
                    text: t.terms,
                  },
                  {
                    href: design.footer.link_support ?? "/support",
                    text: t.support,
                  },
                ]}
                instagram={design.footer.link_instagram}
                paragraph={design.footer.paragraph?.html}
              />
            )}
          </main>
          <ConfirmDrawer
            {...beforeShareDialog.props}
            onConfirm={triggerShare}
          />
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
  locale,
}: {
  invitation: {
    is_claimed: boolean;
  };
  locale: keyof typeof dictionary;
}) {
  const t = dictionary[locale];

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
        {t.invitation_status_accepted}
      </Badge>
    );
  }

  return (
    <Badge className="bg-white/80 text-blue-600 hover:bg-white flex items-center gap-1 font-medium">
      {t.invitation_status_sent}
    </Badge>
  );
}
