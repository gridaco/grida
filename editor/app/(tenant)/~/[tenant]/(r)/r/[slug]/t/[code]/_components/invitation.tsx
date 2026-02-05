"use client";

import React from "react";
import { ScreenRoot } from "@/theme/templates/kit/components";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Platform } from "@/lib/platform";
import InvitationPageTemplate from "@/theme/templates/enterprise/west-referral/invitation/page";
import InvitationCouponTemplate from "@/theme/templates/enterprise/west-referral/invitation/coupon";
import { TemplateData } from "@/theme/templates/enterprise/west-referral/templates";
import {
  campaignShadcnThemeToCssText,
  resolveCampaignShadcnTheme,
} from "@/theme/shadcn/campaign-theme";

interface CampaignPublicData {
  "signup-form-id": string;
}

export default function InvitationPage({
  context,
  client,
  template,
}: {
  context: Platform.WEST.Referral.InvitationPublicRead;
  client: Platform.WEST.Referral.WestReferralClient;
  template: TemplateData.West_Referrral__Duo_001;
}) {
  const { is_claimed, referrer_name: _referrer_name } = context;
  const referrer_name = _referrer_name || "?";
  const is_first_time = !is_claimed;
  const [open, setOpen] = React.useState(is_first_time);

  const _t = template.theme;
  const _u = template.components["invitation-ux-overlay"];
  const _i = template.components.invitation;
  const shadcnTheme = resolveCampaignShadcnTheme(_t?.styles);

  return (
    <ScreenRoot>
      {shadcnTheme && (
        <style
          id="campaign-shadcn-theme"
          dangerouslySetInnerHTML={{
            __html: campaignShadcnThemeToCssText(shadcnTheme),
          }}
        />
      )}
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.DialogContent className="fixed inset-0 p-0 border-none outline-none bg-background data-[state=closed]:animate-out data-[state=closed]:fade-out-0 z-10">
            <DialogPrimitive.Title className="sr-only">
              Overlay
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              UX Overlay
            </DialogPrimitive.Description>
            <InvitationCouponTemplate
              locale={template.locale}
              data={{ referrer_name: context.referrer_name }}
              design={{
                logo: _t?.navbar?.logo,
                coupon: _u?.image ?? {
                  src: "",
                },
              }}
              onComplete={() => setOpen?.(false)}
            />
          </DialogPrimitive.DialogContent>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <InvitationPageTemplate
        design={{
          logo: _t?.navbar?.logo,
          title: _i?.title ?? context.campaign.title,
          description: _i?.description,
          invitation_card_content: _i?.invitation_card_content,
          article: _i?.article,
          cta: _i?.cta ?? "Join Now",
          image: _i?.image,
        }}
        locale={template.locale}
        data={{
          ...context,
          // FIXME: type strong or dynamic schema needed.
          signup_form_id:
            (context.campaign.public as CampaignPublicData | null)?.[
              "signup-form-id"
            ] ?? "",
        }}
        visible={!open}
        client={client}
      />
    </ScreenRoot>
  );
}
