"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { notFound } from "next/navigation";
import {
  ScreenMobileFrame,
  ScreenRoot,
  ScreenScrollable,
  ScreenWindowRoot,
  Timer,
} from "@/theme/templates/kit/components";
import { CampaignData, mock } from "../../data";
import { CountdownTimer } from "../../timer";

const mkshare = (d: CampaignData) => {
  return {
    title: "Polestar 2",
    text: `${d.user.name}님의 Polestar 2 시승 초대 이벤트`,
    // url: `https://demo.grida.co/${d.cid}`,
    url: `http://localhost:3000/demo/sales/campaign/polestar-kr-2503/${d.cid}/join`,
  };
};

export default function PolestarPromo({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  const d = mock.find((c) => c.cid === params.cid);
  if (!d) {
    return notFound();
  }

  const onshareclick = () => {
    if (!navigator.share) return;
    navigator
      .share(mkshare(d))
      .then(() => {
        alert("Thanks for sharing!");
      })
      .catch(() => {
        alert("cancel sharing");
      });
  };

  return (
    <ScreenWindowRoot>
      <ScreenRoot>
        <ScreenMobileFrame>
          <ScreenScrollable>
            {/* Header */}
            <header className="py-4">
              <h1 className="text-3xl font-light text-center">Polestar</h1>
            </header>

            {/* Hero Section */}
            <div className="relative w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.polestar.com/dato-assets/11286/1725964311-pak_home_image-card_pc.jpeg?q=35&dpr=2&w=542"
                alt="Polestar 4"
                className="object-cover aspect-square select-none pointer-events-none"
              />
              <div className="absolute bottom-8 left-8">
                <h2 className="text-3xl font-bold text-white">Polestar 4</h2>
                <p className="text-white mt-2">
                  시승 초대하고 경품을 받아보세요
                </p>
              </div>
            </div>

            {/* Countdown Timer */}
            <div className="flex justify-center items-center py-12 px-4">
              <CountdownTimer />
            </div>

            {/* Stats Grid */}
            <Card className="mx-4 p-6 grid grid-cols-3 gap-4 divide-x">
              <div className="text-center">
                <p className="text-3xl font-bold">1명</p>
                <p className="text-sm mt-2">Polestar 4</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">30명</p>
                <p className="text-sm mt-2">iPad Air 11</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold">100%</p>
                <p className="text-sm mt-2">스타벅스 아메리카노</p>
              </div>
            </Card>

            {/* Info Section */}
            <div className="px-4 py-8 space-y-4">
              <p className="flex items-start space-x-2">
                <span className="text-gray-600">✓</span>
                <span>
                  시승 초대를 한 고객과, 초대 링크를 통해 시승 신청을 한 고객
                  모두에게 경품을 드립니다.
                </span>
              </p>
              <p className="flex items-start space-x-2">
                <span className="text-gray-600">✓</span>
                <span>
                  링크는 횟수와 무관하게 공유 가능하되, 선착순 10명이 신청 완료
                  할 경우 해당 링크는 더 이상 사용할 수 없게 됩니다.
                </span>
              </p>
              <p className="flex items-start space-x-2">
                <span className="text-gray-600">✓</span>
                <span>1인 당 1회만 신청이 복가합니다.</span>
              </p>
            </div>

            {/* CTA Button */}
            <footer className="bottom-0 left-0 right-0 bg-white p-4 shadow-t">
              <Button
                onClick={onshareclick}
                className="w-full bg-black text-white hover:bg-gray-800"
                size="lg"
              >
                시승 초대하기
              </Button>
            </footer>
          </ScreenScrollable>
        </ScreenMobileFrame>
      </ScreenRoot>
    </ScreenWindowRoot>
  );
}
