"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FormView } from "@/grida-forms-hosted/e";
import {
  ScreenMobileFrame,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { Platform } from "@/lib/platform";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TicketCheckIcon } from "lucide-react";
import { ShineBorder } from "@/www/ui/shine-border";
import * as Standard from "@/theme/templates/enterprise/west-referral/standard";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { template } from "@/utils/template";
import {
  useFormSession,
  useRequestFormSession,
} from "@/grida-forms-hosted/e/load";
import { Skeleton } from "@/components/ui/skeleton";
import { submitFormToDefaultEndpoint } from "@/grida-forms-hosted/internal-sdk/submit";

/** Form submit error codes returned by POST /v1/submit/:id (when Accept: application/json). */
type FormSubmitErrorCode =
  | "INTERNAL_SERVER_ERROR"
  | "MISSING_REQUIRED_HIDDEN_FIELDS"
  | "UNKNOWN_FIELDS_NOT_ALLOWED"
  | "FORM_FORCE_CLOSED"
  | "FORM_CLOSED_WHILE_RESPONDING"
  | "FORM_RESPONSE_LIMIT_REACHED"
  | "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED"
  | "FORM_SCHEDULE_NOT_IN_RANGE"
  | "FORM_SOLD_OUT"
  | "FORM_OPTION_UNAVAILABLE"
  | "CHALLENGE_EMAIL_NOT_VERIFIED";

type InvitationLocale = "en" | "ko";

const formErrorMessages: Record<
  InvitationLocale,
  Record<FormSubmitErrorCode | "default", string>
> = {
  ko: {
    FORM_SCHEDULE_NOT_IN_RANGE:
      "이벤트 접수가 마감되었거나 아직 시작 전입니다.",
    FORM_FORCE_CLOSED: "이벤트가 종료되어 참여 신청을 받지 않습니다.",
    FORM_CLOSED_WHILE_RESPONDING:
      "제출 중에 이벤트가 마감되었습니다. 다시 시도해 주세요.",
    FORM_RESPONSE_LIMIT_REACHED: "참여 인원이 마감되었습니다.",
    FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED: "이미 참여 신청을 완료하셨습니다.",
    FORM_SOLD_OUT: "재고가 소진되었습니다.",
    FORM_OPTION_UNAVAILABLE: "선택한 옵션이 더 이상 제공되지 않습니다.",
    CHALLENGE_EMAIL_NOT_VERIFIED: "이메일 인증을 먼저 완료해 주세요.",
    MISSING_REQUIRED_HIDDEN_FIELDS:
      "필수 정보가 누락되었습니다. 페이지를 새로고침 후 다시 시도해 주세요.",
    UNKNOWN_FIELDS_NOT_ALLOWED:
      "요청을 처리할 수 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.",
    INTERNAL_SERVER_ERROR:
      "일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    default: "이벤트 참여에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  },
  en: {
    FORM_SCHEDULE_NOT_IN_RANGE:
      "This event is not open yet or has already ended.",
    FORM_FORCE_CLOSED: "This event is closed and no longer accepting sign-ups.",
    FORM_CLOSED_WHILE_RESPONDING:
      "The event closed while you were submitting. Please try again.",
    FORM_RESPONSE_LIMIT_REACHED:
      "This event has reached the maximum number of participants.",
    FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED:
      "You have already signed up for this event.",
    FORM_SOLD_OUT: "This item is sold out.",
    FORM_OPTION_UNAVAILABLE: "The selected option is no longer available.",
    CHALLENGE_EMAIL_NOT_VERIFIED: "Please verify your email before submitting.",
    MISSING_REQUIRED_HIDDEN_FIELDS:
      "Required information is missing. Please refresh and try again.",
    UNKNOWN_FIELDS_NOT_ALLOWED:
      "Your request could not be processed. Please refresh and try again.",
    INTERNAL_SERVER_ERROR:
      "Something went wrong. Please try again in a moment.",
    default: "Event participation failed. Please try again.",
  },
};

function getFormErrorMessage(
  locale: InvitationLocale,
  code?: string | null,
  apiMessage?: string | null
): string {
  const messages = formErrorMessages[locale] ?? formErrorMessages.en;
  const key = (code ?? "default") as FormSubmitErrorCode | "default";
  if (key in messages) return messages[key as keyof typeof messages];
  return apiMessage?.trim() || messages.default;
}

const dictionary = {
  ko: {
    an_anonymous: "익명의 사용자",
    about_event: "이벤트 안내",
    event_signup_success: "이벤트 참여신청이 완료되었습니다.",
    event_signup_fail: "이벤트 참여에 실패했습니다.",
    claim_fail: "참여 등록을 완료하지 못했습니다. 다시 시도해 주세요.",
    claim_already_claimed: "이미 사용된 초대입니다.",
    claimed_title: "참여가 접수되었습니다.",
    claimed_description:
      "이벤트 참여 신청이 완료되었습니다. 확인 후 안내드리겠습니다.",
    invitation_name: "{referrer_name} 님의 초대",
    invitation_description:
      "{referrer_name}님으로부터 초대를 받았습니다. 이벤트 참여 시 {referrer_name}님과 이벤트 참여자 모두에게 경품이 지급됩니다.",
  },
  en: {
    an_anonymous: "Anonymous User",
    about_event: "Event Information",
    event_signup_success: "Event participation request completed.",
    event_signup_fail: "Event participation failed.",
    claim_fail: "We couldn't complete your sign-up. Please try again.",
    claim_already_claimed: "This invitation has already been used.",
    claimed_title: "You're all set.",
    claimed_description:
      "Your event participation has been received. We'll contact you with the next steps.",
    invitation_name: "{referrer_name} invited you",
    invitation_description:
      "You have been invited by {referrer_name}. Both the inviter and invitee will receive a reward upon event participation.",
  },
};

type Props = {
  logo?: {
    src: string;
    srcDark?: string;
    width?: number;
    height?: number;
  };
  image?: {
    src: string;
    alt?: string;
  };
  brand_name?: string;
  title: string;
  description?: string;
  invitation_card_content?: { type: "richtext"; html: string };
  favicon?: {
    src: string;
    srcDark?: string;
  };
  article?: {
    html: string;
  };
  cta: string;
  /** When set, CTA is hidden and this system message is shown instead. */
  schedule_message?: string | null;
  footer?: {
    link_privacy: string;
    link_instagram: string;
    paragraph: {
      html: string;
    };
  };
};

export default function InvitationPageTemplate({
  data,
  visible = true,
  design,
  locale,
  client,
}: {
  visible?: boolean;
  design: Props;
  locale: keyof typeof dictionary;
  data: Platform.WEST.Referral.InvitationPublicRead & {
    signup_form_id: string;
  };
  client?: Platform.WEST.Referral.WestReferralClient;
}) {
  if (!visible) return null;

  const t = dictionary[locale];
  const { code, referrer_name: _referrer_name, is_claimed } = data;
  const referrer_name = _referrer_name || t.an_anonymous;
  const router = useRouter();
  const [claimed, setClaimed] = useState(is_claimed);

  const signupformDialog = useDialogState("signupform");

  useEffect(() => {
    setClaimed(is_claimed);
  }, [is_claimed]);

  // if (token.is_burned) {
  //   return <>Already used.</>;
  // }

  return (
    <ScreenMobileFrame>
      <ScreenScrollable>
        <div data-testid="west-referral-invitation-page">
          {/* Header */}
          <Standard.Header>
            {design.logo && (
              <Standard.Logo
                src={design.logo.src}
                srcDark={design.logo.srcDark}
                alt="logo"
                width={320}
                height={64}
                className="max-h-8 w-auto object-contain"
              />
            )}
          </Standard.Header>

          {/* Main Image */}
          <Standard.Section className="pb-4">
            <Standard.MainImage
              src={design?.image?.src}
              alt={design?.image?.alt}
            />
          </Standard.Section>

          <Standard.Section className="py-4">
            <Standard.Title>{design.title}</Standard.Title>
            <span className="text-sm text-muted-foreground">
              {design.description}
            </span>
            {design.brand_name && design.favicon && (
              <Standard.BrandHostChip
                logo={design.favicon}
                name={design.brand_name}
              />
            )}
          </Standard.Section>

          {/* Countdown Timer */}
          {/* {!is_claimed && (
            <div className="flex justify-center items-center py-12 px-4">
              <CountdownTimer />
            </div>
          )} */}

          <Standard.Section>
            <Card
              data-testid="west-referral-invitation-card"
              className="relative overflow-hidden border-0 py-0"
            >
              <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
              <div className="px-4 py-1.5 m-0.5 relative border border-background overflow-hidden flex items-center z-10">
                {/* background */}
                <div className="absolute inset-0 bg-gradient-to-bl from-[#A07CFE] to-[#FFBE7B] opacity-30" />
                <div className="z-10 flex items-center gap-2">
                  <TicketCheckIcon className="size-5" />
                  <span className="text-sm font-medium">
                    {template(t.invitation_name, {
                      referrer_name,
                    })}
                  </span>
                </div>
              </div>
              <CardContent className="px-4 py-4">
                {design.invitation_card_content?.html ? (
                  <div
                    className="prose prose-sm dark:prose-invert text-muted-foreground"
                    dangerouslySetInnerHTML={{
                      __html: design.invitation_card_content?.html ?? "",
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    (Customize your message in campaign designer)
                  </p>
                )}
              </CardContent>
              {!claimed &&
                (design.schedule_message ? (
                  <CardFooter className="px-4 pb-4">
                    <p className="text-sm text-muted-foreground text-center w-full">
                      {design.schedule_message}
                    </p>
                  </CardFooter>
                ) : (
                  <CardFooter className="px-4 pb-4">
                    {/* CTA Button */}
                    <Button
                      onClick={signupformDialog.openDialog}
                      className="w-full"
                      size="lg"
                    >
                      {design.cta}
                    </Button>
                  </CardFooter>
                ))}
            </Card>

            {/* FIXME: use challenges */}
            {claimed && (
              <div className="my-4">
                <Card
                  data-testid="west-referral-invitation-claimed-card"
                  className="relative overflow-hidden"
                >
                  <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TicketCheckIcon className="size-5" />
                      {t.claimed_title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {t.claimed_description}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </Standard.Section>

          <SignUpForm
            {...signupformDialog.props}
            form_id={data.signup_form_id}
            invitation_code={code}
            client={client}
            locale={locale}
            copy={t}
            onClaimed={() => {
              setClaimed(true);
              signupformDialog.closeDialog();
              router.refresh();
            }}
          />

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
          {/* {design.footer && (
            <Standard.FooterTemplate
              logo={design.favicon}
              links={[
                {
                  href: design.footer.link_privacy,
                  text: t.privacy,
                },
              ]}
            />
          )} */}
        </div>
      </ScreenScrollable>
    </ScreenMobileFrame>
  );
}

function SignUpForm({
  form_id,
  invitation_code,
  client,
  locale,
  copy,
  onClaimed,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  form_id: string;
  invitation_code: string;
  client?: Platform.WEST.Referral.WestReferralClient;
  locale: keyof typeof dictionary;
  copy: (typeof dictionary)[keyof typeof dictionary];
  onClaimed?: () => void;
}) {
  const isOpen = props.open === true;
  const hasForm = typeof form_id === "string" && form_id.length > 0;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const formdata = new FormData(e.target as HTMLFormElement);
    const submit_json = await submitFormToDefaultEndpoint<{
      customer_id?: string | null;
    }>(form_id, formdata);

    const resError = submit_json && (submit_json as { error?: string }).error;
    const resMessage =
      submit_json && (submit_json as { message?: string }).message;
    if (resError != null || (submit_json && submit_json.data == null)) {
      const msg = getFormErrorMessage(
        locale as InvitationLocale,
        resError ?? undefined,
        resMessage ?? undefined
      );
      toast.error(msg);
      return;
    }

    const customer_id =
      submit_json?.data?.customer_id &&
      typeof submit_json.data.customer_id === "string"
        ? submit_json.data.customer_id
        : null;

    if (!customer_id) {
      toast.error(copy.event_signup_fail);
      return;
    }

    if (!client) {
      toast.error(copy.event_signup_fail);
      return;
    }

    const claimResult = await client.claim(invitation_code, customer_id);
    if (!claimResult.ok) {
      const errMsg = claimResult.error?.message?.toLowerCase() ?? "";
      const isAlreadyClaimed =
        errMsg.includes("already claimed") || errMsg.includes("already used");
      toast.error(
        isAlreadyClaimed ? copy.claim_already_claimed : copy.claim_fail
      );
      return;
    }

    toast.success(copy.event_signup_success);
    onClaimed?.();
  };

  return (
    <Drawer {...props} data-testid="west-referral-invitation-signup-form">
      {/* Ref: shadcn-ui/ui#2167 – scrolling inside Drawer on mobile.
          Key: give drawer a fixed (d)vh height + overflow-hidden,
          and make the scroll container fill the remaining height. */}
      <DrawerContent className="h-[90dvh] max-h-[90dvh] min-h-0 overflow-hidden">
        <DrawerTitle className="sr-only">Mission Signup Form</DrawerTitle>

        {/* Only mount the form session + loading state when the drawer is open.
            This prevents the loading skeleton from rendering inline on the page. */}
        {isOpen ? (
          hasForm ? (
            <FormViewProvider form_id={form_id} locale={locale}>
              <div className="flex min-h-0 flex-1 flex-col">
                {/* Scrollable form area (critical for small screens). */}
                <ScrollArea className="min-h-0 flex-1">
                  <div>
                    <FormView.Body
                      onSubmit={onSubmit}
                      className="max-w-full"
                      config={{
                        is_powered_by_branding_enabled: false,
                      }}
                    />
                  </div>
                </ScrollArea>

                {/* Fixed action area */}
                <DrawerFooter className="pt-2 border-t bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  <FormView.Prev />
                  <FormView.Next />
                  <FormView.Submit />
                </DrawerFooter>
              </div>
            </FormViewProvider>
          ) : (
            <div className="p-4">
              <p className="text-sm text-muted-foreground">
                No signup form configured.
              </p>
            </div>
          )
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function FormViewProvider({
  form_id,
  locale,
  children,
}: React.PropsWithChildren<{
  form_id: string;
  locale: string;
}>) {
  // TODO: make FormViewProvider accept a configurable loading/empty state renderer
  // (or allow callers to fully control loading UX). For now, we keep a simple
  // built-in skeleton and only mount this provider when the dialog is open.
  const { session, clearSessionStorage } = useRequestFormSession(form_id);
  const { data: res, isLoading } = useFormSession(form_id, {
    mode: "signed",
    session_id: session,
    // TODO: not implemented
    user_id: "",
  });

  useEffect(() => {
    return () => {
      clearSessionStorage();
    };
  }, []);

  const { data } = res || {};

  if (isLoading || !session || !data) {
    return (
      <div className="p-4">
        <Skeleton className="w-full h-24" />
      </div>
    );
  }

  const { blocks, tree, fields, default_values, lang } = data;

  return (
    <FormView.Root
      form_id={form_id}
      session_id={session}
      lang={lang ?? locale}
      fields={fields}
      defaultValues={default_values}
      blocks={blocks}
      tree={tree}
    >
      {children}
    </FormView.Root>
  );
}
