"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import Image from "next/image";
import clsx from "clsx";
import bentomainbg from "@/app/(www)/(forms)/_sections/bento-bg.png";

interface DemoCardData {
  artwork: string;
  title: string;
  description: string;
}

const categories = [
  "Real-Time Monitoring",
  "Developer Tools",
  "Campaign Manager",
  "High Traffic Management",
  "Ticketing / Inventory",
];

const imagesDemo2: Record<
  string,
  {
    main: {
      text: string[];
      highlightColorStops: [string, string, string];
      artwork: string;
    };
    subs: DemoCardData[];
  }
> = {
  "Real-Time Monitoring": {
    main: {
      text: ["플랜", "프리뷰", "오픈"],
      highlightColorStops: ["from-orange-600", "via-red-500", "to-orange-400"],
      artwork: "/affiliate/poc/images/demo-2-images/campaign-image-main.png",
    },
    subs: [
      {
        title: "멀티 캠페인",
        description:
          "여러 폼을 생성할 필요없이, 하나의 폼으로 여러 채널에서 캠페인을 동시에 관리할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub1.png",
      },
      {
        title: "스케줄링",
        description: "캠페인 별로 스케줄을 설정하여 관리할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub2.png",
      },
      {
        title: "대기열 알림",
        description:
          "사용자가 대기열에 등록하여 접수가 시작될 때 알림을 받을 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/campaign-image-sub3.png",
      },
    ],
  },
  "Developer Tools": {
    main: {
      text: ["강력한", "큐 관리"],
      highlightColorStops: ["from-blue-700", "via-blue-500", "to-green-400"],
      artwork: "/affiliate/poc/images/demo-2-images/traffic-image-main.png",
    },
    subs: [
      {
        title: "시뮬레이터",
        description:
          "시스템이 작동하지 않을까봐 걱정되시나요? 시뮬레이터를 통해 사전에 미리 대용량 트래픽을 테스트 해볼 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub1.png",
      },
      {
        title: "기술 지원",
        description:
          "콘서트, 마라톤 접수 등 전국에서 신청이 몰리는 이벤트의 경우, 기술팀의 지원을 받아 차질없는 진행을 도와드립니다. *별도 문의",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub2.png",
      },
      {
        title: "개별 큐 서버",
        description:
          "최대 동시 접속 10만명까지 대용량 이벤트의 경우 별도의 Redis 큐 서버를 사용하실 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/traffic-image-sub3.png",
      },
    ],
  },
  "Campaign Manager": {
    main: {
      text: ["티켓팅", "인벤토리"],
      highlightColorStops: ["from-red-400", "via-pink-400", "to-purple-500"],
      artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-main.png",
    },
    subs: [
      {
        title: "로직 블록과 함께 유연한 구현",
        description: "로직 블록과 함께 복잡한 인벤토리 로직 구현도 가능합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub1.png",
      },
      {
        title: "재입고 알림",
        description:
          "티켓 재고가 소진되었을 경우, 고객이 재입고 알림을 신청할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub2.png",
      },
      {
        title: "결제",
        description:
          "TossPayments나 Stripe를 통해 전세계에서 네이티브한 결제 경험을 제공해 보세요.",
        artwork: "/affiliate/poc/images/demo-2-images/ticketing-image-sub3.png",
      },
    ],
  },
  "High Traffic Management": {
    main: {
      text: ["똑똑한", "고객 관리"],
      highlightColorStops: [
        "from-orange-500",
        "via-yellow-400",
        "to-orange-200",
      ],
      artwork: "/affiliate/poc/images/demo-2-images/customer-image-main.png",
    },
    subs: [
      {
        title: "확정 문자 발송",
        description: "폼 신청이 접수된 고객에게 확정 문자를 보낼 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub1.png",
      },
      {
        title: "문의 응대",
        description: "폼에 관한 고객들의 문의들을 확인하고 답할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub2.png",
      },
      {
        title: "AI 프로세싱",
        description:
          "고객의 응답을 기반으로 AI가 고객 분석및 데이터베이스를 자동으로 구성합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/customer-image-sub3.png",
      },
    ],
  },
  "Ticketing / Inventory": {
    main: {
      text: ["바닥부터", "Headless"],
      highlightColorStops: ["from-green-700", "via-green-500", "to-green-300"],
      artwork: "/affiliate/poc/images/demo-2-images/developer-image-main.png",
    },
    subs: [
      {
        title: "철저한 개발자를 위한 설계",
        description:
          "Grida Forms는 바닥부터 개발자를 위한 Headless Forms로 설계 되었습니다. 무엇을 상상하든 구현 가능합니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub1.png",
      },
      {
        title: "고객 DB 연동",
        description:
          "SSO를 통한 고객 통합 로그인 뿐만 아니라, SQL을 통한 직접적인 쿼리 및 Wrapper를 연동할 수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub2.png",
      },
      {
        title: "SDK",
        description:
          "이미 개발팀이 있으신가요? 마케터를 위한 폼 빌더로 사용하고. 앱에 유동적으로 연동하여 사용할수 있습니다.",
        artwork: "/affiliate/poc/images/demo-2-images/developer-image-sub3.png",
      },
    ],
  },
};

export default function Content2() {
  const tabsRef = useRef<(HTMLElement | null)[]>([]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [tabUnderlineWidth, setTabUnderlineWidth] = useState(0);
  const [tabUnderlineLeft, setTabUnderlineLeft] = useState(0);

  useEffect(() => {
    const setTabPosition = () => {
      const currentTab = tabsRef.current[activeTabIndex] as HTMLElement;
      setTabUnderlineLeft(currentTab?.offsetLeft ?? 0);
      setTabUnderlineWidth(currentTab?.clientWidth ?? 0);
    };

    setTabPosition();
  }, [activeTabIndex]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.0, ease: "easeOut" }}
      className="w-full mx-0"
    >
      <div className="flex flex-col items-center justify-center my-16 gap-10 py-20">
        {/* Tabs List with Sliding Underline */}
        <div className="relative flex flex-wrap bg-transparent h-9 items-center content-center gap-3 justify-center text-slate-400">
          {/* Sliding Underline */}
          <span
            className="absolute bottom-0 top-0 -z-10 flex overflow-hidden rounded-full transition-all duration-300"
            style={{
              left: tabUnderlineLeft,
              width: tabUnderlineWidth,
            }}
          >
            <span className="h-full w-full rounded-full bg-black" />
          </span>

          {/* Tabs */}
          {categories.map((category, index) => (
            <button
              key={category}
              ref={(el) => {
                tabsRef.current[index] = el;
              }}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1 font-normal transition-all ${
                activeTabIndex === index
                  ? "bg-black text-white dark:invert"
                  : "hover:text-slate-200"
              }`}
              onClick={() => setActiveTabIndex(index)}
            >
              {category}
            </button>
          ))}
        </div>

        {/* Tabs Content */}
        <div className="container flex flex-col gap-5 px-8">
          <div className="relative rounded-xl shadow-lg overflow-hidden border">
            <div className="absolute top-10 left-10 md:top-20 md:left-20">
              <span className="flex flex-col gap-1">
                {imagesDemo2[categories[activeTabIndex]].main.text.map(
                  (t, i) => {
                    const isLast =
                      i ===
                      imagesDemo2[categories[activeTabIndex]].main.text.length -
                        1;
                    return (
                      <BentoCardKeyword
                        key={i}
                        className="text-4xl md:text-7xl font-black"
                        steps={
                          isLast
                            ? imagesDemo2[categories[activeTabIndex]].main
                                .highlightColorStops
                            : undefined
                        }
                      >
                        {t}
                      </BentoCardKeyword>
                    );
                  }
                )}
              </span>
            </div>
            <Image
              priority
              className="md:h-[776px] w-full object-cover"
              src={imagesDemo2[categories[activeTabIndex]].main.artwork}
              alt={`${categories[activeTabIndex]}-main`}
              width={1400}
              height={776}
            />
            <Image
              priority
              className="absolute inset-0 w-full h-full object-cover -z-10"
              src={bentomainbg}
              alt={`${categories[activeTabIndex]}-main`}
              width={1400}
              height={776}
            />
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-4 gap-5">
            {imagesDemo2[categories[activeTabIndex]].subs.map((sub, i) => {
              return (
                <BentoCard
                  key={i}
                  artwork={sub.artwork}
                  alt={`${categories[activeTabIndex]}-sub2`}
                  text1={sub.title}
                  text2={sub.description}
                  className={clsx(
                    "relative rounded-xl shadow-lg w-full border overflow-hidden",
                    "md:h-[320px]",
                    i === 0 ? "lg:col-start-1 lg:col-span-2" : ""
                  )}
                />
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function BentoCardKeyword({
  className,
  steps,
  children,
}: React.PropsWithChildren<{
  className?: string;
  steps?: [string, string, string];
}>) {
  const gradientClasses = steps
    ? `text-transparent bg-gradient-to-r ${steps.join(" ")} bg-clip-text`
    : "";

  return (
    <span>
      <h1 className={clsx(gradientClasses, "inline-block", className)}>
        {children}
      </h1>
    </span>
  );
}

function BentoCard({
  artwork,
  alt,
  text1,
  text2,
  className,
}: {
  artwork: string;
  alt: string;
  text1: string;
  text2: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-3 p-8">
        <h6 className="text-xl md:text-4xl font-bold">{text1}</h6>
        <span className="max-w-sm text-sm text-muted-foreground">{text2}</span>
      </div>
      <Image
        className="hidden md:block absolute right-0 top-0 bottom-0 overflow-hidden object-right-bottom object-cover w-auto h-full -z-10"
        src={artwork}
        alt={alt}
        width={500}
        height={500}
      />
    </div>
  );
}
