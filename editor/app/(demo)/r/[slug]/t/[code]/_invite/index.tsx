"use client";

import React from "react";
import { Platform } from "@/lib/platform";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import ReferrerPageTemplate from "@/theme/templates/west-referral/referrer/page";
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
  const {
    code,
    campaign,
    referrer_name: _referrer_name,
    invitation_count,
    invitations,
    // children: subtokens,
  } = data;
  const referrer_name = _referrer_name || "?";

  const confirmDialog = useDialogState("confirm");

  const { max_invitations_per_referrer: max_supply } = campaign;

  // const available_count = (max_supply ?? 0) - (invitation_count ?? 0);
  // const is_available = available_count > 0;

  // const triggerShare = async () => {
  //   return mkshare({
  //     campaign_slug: campaign.slug,
  //     referrer_code: code!,
  //     referrer_name,
  //   }).then((sharable) => {
  //     share_or_copy(sharable)
  //       .then(({ type }) => {
  //         switch (type) {
  //           case "share":
  //             toast.success("초대권이 발급되었습니다!");
  //             break;
  //           case "clipboard":
  //             toast.success("초대권이 복사되었습니다!");
  //             break;
  //         }
  //       })
  //       .finally(() => {
  //         mutate(code);
  //         confirmDialog.closeDialog();
  //       });
  //   });
  // };

  return (
    <ReferrerPageTemplate
      design={{
        logo: {
          src: "/logos/polestar.png",
          srcDark: "/logos/polestar-dark.png",
        },
        brand_name: "Polestar",
        title: "시승 초대 하고 경품 받기",
        description: `${referrer_name} 고객님의 Polestar 4 시승 추천 페이지입니다.`,
        favicon: {
          src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
          srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
        },
        article: { html: t.info },
        cta: {
          text: t.cta.label,
        },
        image: t.hero.media,
        footer: {
          link_privacy: "/privacy",
          link_instagram: "https://www.instagram.com/polestarcars/",
          paragraph: {
            html: "폴스타오토모티브코리아 유한회사 사업자등록번호 513-87-02053 / 통신판매업신고번호 2021-서울강남-07017 / 대표 HAM JONG SUNG(함종성) / 주소 서울특별시 강남구 학동로 343, 5층(논현동) / 전화번호 080-360-0100",
          },
        },
      }}
      locale="ko"
      data={data}
    />
  );
}
