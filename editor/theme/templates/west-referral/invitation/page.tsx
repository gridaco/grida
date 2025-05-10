"use client";

import React, { useEffect, useState } from "react";
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { FormView } from "@/scaffolds/e/form";
import {
  ScreenMobileFrame,
  ScreenScrollable,
} from "@/theme/templates/kit/components";
import { Platform } from "@/lib/platform";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TicketCheckIcon } from "lucide-react";
import { ShineBorder } from "@/www/ui/shine-border";
import Link from "next/link";
import * as Standard from "@/theme/templates/west-referral/standard";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { template } from "@/utils/template";
import { useFormSession, useRequestFormSession } from "@/scaffolds/e/form/load";
import { Skeleton } from "@/components/ui/skeleton";

const dictionary = {
  ko: {
    an_anonymous: "익명의 사용자",
    about_event: "이벤트 안내",
    event_signup_success: "이벤트 참여신청이 완료되었습니다.",
    event_signup_fail: "이벤트 참여에 실패했습니다.",
    invitation_name: "{referrer_name} 님의 초대",
    invitation_description:
      "{referrer_name}님으로부터 초대를 받았습니다. 이벤트 참여 시 {referrer_name}님과 이벤트 참여자 모두에게 경품이 지급됩니다.",
  },
  en: {
    an_anonymous: "Anonymous User",
    about_event: "Event Information",
    event_signup_success: "Event participation request completed.",
    event_signup_fail: "Event participation failed.",
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
  favicon?: {
    src: string;
    srcDark?: string;
  };
  article?: {
    html: string;
  };
  cta: string;
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
  const t = dictionary[locale];
  const { code, campaign, referrer_name: _referrer_name, is_claimed } = data;
  const referrer_name = _referrer_name || t.an_anonymous;
  const router = useRouter();

  const signupformDialog = useDialogState("signupform");

  // if (token.is_burned) {
  //   return <>Already used.</>;
  // }

  // FIXME:
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
            <Card className="relative overflow-hidden rounded-xl border-0">
              <ShineBorder shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
              <div className="px-4 py-1.5 m-0.5 relative border border-background rounded-t-[10px] overflow-hidden flex items-center z-10">
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
                  {template(t.invitation_description, {
                    referrer_name,
                  })}
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
                    {design.cta}
                  </Button>
                </CardFooter>
              )}
            </Card>

            {/* FIXME: use challenges */}
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
                      {/* FIXME: */}
                      {/* <br />
                      <br />
                      시승 신청을 완료하지 못하였나요?{" "}
                      <Link href={fixme_external_link} className="underline">
                        다시 신청하기
                      </Link> */}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}
          </Standard.Section>

          <SignUpForm
            {...signupformDialog.props}
            form_id={data.signup_form_id}
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
  onSubmit,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  form_id: string;
  onSubmit?: (data: { name: string; phone: string }) => Promise<void>;
}) {
  const onClaim = async () => {
    // const customer_id = submission.data.customer_id;
    // const ok = await client?.claim?.(code, customer_id);
    // if (ok) {
    //   toast.success(t.event_signup_success);
    //   router.replace(fixme_external_link);
    // } else {
    //   toast.error(t.event_signup_fail);
    // }
  };

  return (
    <FormViewProvider form_id={form_id}>
      <Drawer {...props}>
        <DrawerContent>
          <DrawerTitle className="sr-only">Mission Signup Form</DrawerTitle>
          {/*  */}
          <FormView.Body
            onSubmit={(e) => {
              e.preventDefault();

              const formdata = new FormData(e.target as HTMLFormElement);
              // onSubmit?.(formdata);
            }}
            className="max-w-full"
            config={{
              is_powered_by_branding_enabled: false,
            }}
          />

          <DrawerFooter className="pt-2">
            <FormView.Prev>Previous</FormView.Prev>
            <FormView.Next>Next</FormView.Next>
            <FormView.Submit>Save</FormView.Submit>
            {/*  */}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </FormViewProvider>
  );
}

function FormViewProvider({
  form_id,
  children,
}: React.PropsWithChildren<{
  form_id: string;
}>) {
  const { session, clearSessionStorage } = useRequestFormSession(form_id);
  const {
    data: res,
    error: servererror,
    isLoading,
  } = useFormSession(form_id, {
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

  const { data, error } = res || {};

  if (isLoading || !session || !data) {
    return (
      <main className="h-screen min-h-screen">
        <div className="p-4 overflow-auto flex-1">
          <Skeleton className="w-full h-96" />
        </div>
      </main>
    );
  }

  const { blocks, tree, fields, default_values } = data;

  return (
    <FormView.Root
      form_id={form_id}
      session_id={session}
      fields={fields}
      defaultValues={default_values}
      blocks={blocks}
      tree={tree}
    >
      {children}
    </FormView.Root>
  );
}
