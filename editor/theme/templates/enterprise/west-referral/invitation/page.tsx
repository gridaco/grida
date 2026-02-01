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

const dictionary = {
  ko: {
    an_anonymous: "익명의 사용자",
    about_event: "이벤트 안내",
    event_signup_success: "이벤트 참여신청이 완료되었습니다.",
    event_signup_fail: "이벤트 참여에 실패했습니다.",
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
              {!claimed && (
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
  copy,
  onClaimed,
  ...props
}: React.ComponentProps<typeof Drawer> & {
  form_id: string;
  invitation_code: string;
  client?: Platform.WEST.Referral.WestReferralClient;
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

    const ok = await client.claim(invitation_code, customer_id);
    if (!ok) {
      toast.error(copy.event_signup_fail);
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
            <FormViewProvider form_id={form_id}>
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
                {/* TODO: have i18n */}
                <DrawerFooter className="pt-2 border-t bg-background pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                  <FormView.Prev>Previous</FormView.Prev>
                  <FormView.Next>Next</FormView.Next>
                  <FormView.Submit>Save</FormView.Submit>
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
  children,
}: React.PropsWithChildren<{
  form_id: string;
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
