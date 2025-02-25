"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTimer } from "react-timer-hook";
import { notFound } from "next/navigation";

type CampaignData = {
  cid: string;
  user: {
    name: string;
  };
};

const cids = [
  {
    cid: "00000000",
    user: {
      name: "김철수",
    },
  },
  {
    cid: "00000001",
    user: {
      name: "홍길동",
    },
  },
  {
    cid: "00000002",
    user: {
      name: "박영희",
    },
  },
  {
    cid: "00000003",
    user: {
      name: "이영희",
    },
  },
  {
    cid: "00000004",
    user: {
      name: "김영희",
    },
  },
  {
    cid: "00000005",
    user: {
      name: "최영희",
    },
  },
];

const mkshare = (d: CampaignData) => {
  return {
    title: "Polestar 2",
    text: `${d.user.name}님의 Polestar 2 시승 초대 이벤트`,
    // url: `https://demo.grida.co/${d.cid}`,
    url: `http://localhost:3000/demo/sales/polestar-kr-2503/${d.cid}/join`,
  };
};

export default function PolestarPromo({
  params,
}: {
  params: {
    cid: string;
  };
}) {
  const d = cids.find((c) => c.cid === params.cid);
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
    <div className="min-h-screen">
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
          <p className="text-white mt-2">시승 초대하고 경품을 받아보세요</p>
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="flex justify-center items-center py-12 px-4">
        <Timer />
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
            시승 초대를 한 고객과, 초대 링크를 통해 시승 신청을 한 고객 모두에게
            경품을 드립니다.
          </span>
        </p>
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>
            링크는 횟수와 무관하게 공유 가능하되, 선착순 10명이 신청 완료 할
            경우 해당 링크는 더 이상 사용할 수 없게 됩니다.
          </span>
        </p>
        <p className="flex items-start space-x-2">
          <span className="text-gray-600">✓</span>
          <span>1인 당 1회만 신청이 복가합니다.</span>
        </p>
      </div>

      {/* CTA Button */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white p-4 shadow-t">
        <Button
          onClick={onshareclick}
          className="w-full bg-black text-white hover:bg-gray-800"
          size="lg"
        >
          시승 초대하기
        </Button>
      </footer>
    </div>
  );
}

function getNextKSTMidnight() {
  const now = new Date();
  const nowKST = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const nextMidnightKST = new Date(nowKST);
  nextMidnightKST.setDate(nowKST.getDate() + 1);
  nextMidnightKST.setHours(0, 0, 0, 0);
  const diff = nextMidnightKST.getTime() - nowKST.getTime();
  return new Date(now.getTime() + diff);
}

function Timer() {
  const expiryTimestamp = getNextKSTMidnight();
  const { hours, minutes, seconds } = useTimer({
    expiryTimestamp,
    onExpire: () => console.warn("Timer expired"),
  });

  return (
    <div className="text-orange-500 flex flex-col justify-center space-y-4 w-full text-center">
      <hr className="border-orange-500" />
      <div className="text-2xl font-medium">
        {hours}h : {minutes}m : {seconds}s
      </div>
      <hr className="border-orange-500" />
    </div>
  );
}
