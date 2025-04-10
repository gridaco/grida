"use client";

import React from "react";
import { ScreenRoot } from "@/theme/templates/kit/components";
import Hello from "./_flows/hello";
import Main from "./_flows/main";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Platform } from "@/lib/platform";

const article =
  "<h2>🏆 Polestar 4 시승 추천 하고 경품 받아게세요</h2><ul><li>1인 당 중복 신청은 불가합니다.</li><li>시승 초대를 한 고객과, 초대 링크를 통해 시승 신청을 한 고객 모두에게 경품을 드립니다.</li><li>무료 시승입니다.</li><li>시승 전 약 15분의 차량 설명 시간이 있습니다.</li></ul><h6>이벤트 FAQ</h6><ul><li>시승이 완료된 후 경품이 지급됩니다.</li><li>시승 신청자 본인에 한하여 시승 가능하며, 타인에게 양도할 수 없습니다.</li><li>운전면허 소지자 중 만 21세 이상 및 실제 도로 주행 경력 2년 이상의 분들만 참여 가능합니다.</li><li>차량 시승 기간 중 총 주행 가능 거리는 300Km로 제한됩니다.</li><li>시승 기간 중 발생한 통행료, 과태료, 범칙금은 시승 고객 본인 부담입니다.</li><li>시승 신청자에게 휴대폰 문자로 상세 안내 예정입니다.</li></ul>";

export default function InvitationPage({
  data,
}: {
  data: Platform.WEST.Referral.InvitationPublicRead;
}) {
  const locale = "ko"; // FIXME:
  const { is_claimed, referrer_name: _referrer_name } = data;
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
            <Hello
              locale={locale}
              data={{
                referrer: referrer_name ?? "Unknown",
              }}
              onOpenChange={setOpen}
            />
          </DialogPrimitive.DialogContent>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
      <Main
        design={{
          logo: {
            src: "/logos/polestar.png",
            srcDark: "/logos/polestar-dark.png",
          },
          brand_name: "Polestar",
          title: "Polestar 4 시승 하고 경품을 받아보세요",
          description: `${referrer_name} 님 께서 Polestar 4 를 추천 했습니다.`,
          favicon: {
            src: "https://www.polestar.com/w3-assets/favicon-32x32.png",
            srcDark: "https://www.polestar.com/w3-assets/favicon-32x32.png",
          },
          article: { html: article },
          cta: {
            text: "시승 신청하기",
          },
          image: {
            src: "https://www.polestar.com/dato-assets/11286/1725964311-pak_home_image-card_pc.jpeg?q=35&dpr=2&w=542",
          },
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
        visible={!open}
      />
    </ScreenRoot>
  );
}
