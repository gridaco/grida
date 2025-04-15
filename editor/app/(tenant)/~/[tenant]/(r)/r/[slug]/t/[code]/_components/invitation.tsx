"use client";

import React from "react";
import { ScreenRoot } from "@/theme/templates/kit/components";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Platform } from "@/lib/platform";
import InvitationPageTemplate from "@/theme/templates/west-referral/invitation/page";
import InvitationCouponTemplate from "@/theme/templates/west-referral/invitation/coupon";
import { TemplateData } from "@/theme/templates/west-referral/templates";

interface CampaignPublicData {
  "signup-form-id": string;
}

export default function InvitationPage({
  context,
  client,
  templates,
}: {
  context: Platform.WEST.Referral.InvitationPublicRead;
  client: Platform.WEST.Referral.WestReferralClient;
  templates: {
    invitation?: TemplateData.West_Referrral__Duo_001["components"]["invitation"];
    ["invitation-ux-overlay"]?: TemplateData.West_Referrral__Duo_001["components"]["invitation-ux-overlay"];
  };
}) {
  const locale = "ko"; // FIXME:
  const { is_claimed, referrer_name: _referrer_name } = context;
  const referrer_name = _referrer_name || "?";
  const is_first_time = !is_claimed;
  const [open, setOpen] = React.useState(is_first_time);

  return (
    <ScreenRoot>
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
              locale={locale}
              data={{ referrer_name: context.referrer_name }}
              design={{
                // logo: {
                //   src: "/logos/polestar.png",
                //   srcDark: "/logos/polestar-dark.png",
                // },
                coupon: templates["invitation-ux-overlay"]?.image ?? {
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
          // logo: {
          //   src: "/logos/polestar.png",
          //   srcDark: "/logos/polestar-dark.png",
          // },
          favicon: {
            src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
            srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
          },
          brand_name: "Polestar",
          title: templates.invitation?.title ?? context.campaign.title,
          description: templates.invitation?.description,
          article: templates.invitation?.article,
          cta: templates.invitation?.cta ?? "Join Now",
          image: templates.invitation?.image ?? { src: "" },
          footer: {
            link_privacy: "/privacy",
            link_instagram: "https://www.instagram.com/polestarcars/",
            paragraph: {
              html: "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100",
            },
          },
        }}
        locale="ko"
        data={{
          ...context,
          // FIXME:
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
