"use client";

import { GridaLogo } from "@/components/grida-logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from "next/image";
import { Logos } from "./logos";
import React from "react";
import { CaretRightIcon, CheckIcon } from "@radix-ui/react-icons";

const demo_1_categories = [
  "event",
  "sports",
  "music",
  "fasion",
  "cyber",
  "art",
];
const demo_2_categories = [
  "캠페인 매니저",
  "대용량 트래픽",
  "티켓/인벤토리",
  "고객관리",
  "실시간 모니터링",
  "개발자",
];

export default function PartnerPOC() {
  return (
    <main>
      <header className="p-10 w-full">
        <div className="flex justify-end w-full">
          <button className="px-8 py-2 rounded bg-black font-semibold text-white dark:invert">
            시작하기
          </button>
        </div>
      </header>
      <div>
        <section className="min-h-screen flex">
          {/*  */}
          <div className="flex-1 w-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-10">
              <div className="flex items-center justify-center gap-2">
                <GridaLogo />
                <span className="font-bold text-lg">Affiliate</span>
              </div>
              <h1 className="text-4xl font-extrabold text-center">
                POC와 함께하는 <br />
                편리한 이벤트 준비
              </h1>
              <button className=" px-8 py-2 rounded-full bg-black font-semibold text-white dark:invert">
                문의하기
              </button>
            </div>
          </div>
        </section>
        <section className="container my-40">
          <div className="gap-10 flex flex-col items-center justify-center">
            <h2 className=" text-lg font-bold">POC와 함께한 브랜드</h2>
            <Logos />
          </div>
        </section>
        <section className="container my-40">
          <div className="flex flex-col gap-10">
            <header className="flex flex-col gap-4">
              <div className="flex flex-row items-center justify-center">
                <span className="font-bold text-lg">
                  <span className="opacity-50 me-2">최대 30%</span>POC만의
                  할인된 가격에
                </span>
              </div>
              <h2 className="text-4xl font-extrabold text-center">
                브랜드를 가장 잘 담는 나만의 폼 빌더
              </h2>
            </header>
            <div className="container max-w-full bg-muted/50">
              <Tabs
                className="flex flex-col items-center justify-center my-16 gap-10"
                defaultValue={demo_1_categories[0]}
              >
                <TabsList className="flex flex-wrap bg-transparent h-9 items-center content-center gap-3 justify-center p-1 text-muted-foreground">
                  {demo_1_categories.map((category) => (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-black/90 data-[state=active]:text-white data-[state=active]:dark:invert"
                    >
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {demo_1_categories.map((category) => (
                  <TabsContent key={category} value={category}>
                    <Image
                      className="aspect-video rounded-xl shadow-xl overflow-hidden object-cover"
                      src="/images/abstract-placeholder.jpg"
                      alt=""
                      width={1500}
                      height={1500}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </section>
        <section className="relative container mx-auto py-40">
          <Image
            src="/affiliate/poc/images/bg-image.png"
            alt="bg"
            width={1700}
            height={1800}
            className=" absolute top-0 left-0 w-full h-full object-cover -z-10"
          />
          <div className="flex flex-col gap-10">
            <header className="flex flex-col gap-4">
              <div className="flex flex-row items-center justify-center gap-2">
                <span className="font-bold text-lg">
                  이벤트 관리를 위한
                  <GridaLogo className="inline mx-2 mb-[1px]" size={19} />
                  만의 기능
                </span>
              </div>
              <h2 className="text-4xl font-extrabold text-center">
                모든걸 관리하세요
              </h2>
            </header>
            <div>
              <Tabs
                className="flex flex-col items-center justify-center mt-10 gap-10"
                defaultValue={demo_2_categories[0]}
              >
                <TabsList className="flex flex-wrap h-9 bg-transparent items-center content-center gap-3 justify-center p-1 text-muted-foreground">
                  {demo_2_categories.map((category) => (
                    <TabsTrigger
                      key={category}
                      value={category}
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-black/90 data-[state=active]:text-white data-[state=active]:dark:invert"
                    >
                      {category}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {demo_2_categories.map((category) => (
                  <TabsContent key={category} value={category}>
                    <div className="flex flex-col gap-5">
                      <Image
                        className="aspect-video rounded-xl shadow-xl overflow-hidden object-cover"
                        src="/images/abstract-placeholder.jpg"
                        alt=""
                        width={1500}
                        height={1500}
                      />
                      <div className="flex h-72 gap-5">
                        <div className="w-2/3 h-full rounded-xl shadow-xl bg-red-400"></div>
                        <div className="w-1/3 h-full rounded-xl shadow-xl bg-red-400"></div>
                        <div className="w-1/3 h-full rounded-xl shadow-xl bg-red-400"></div>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </section>
        <section className="container mx-auto my-40">
          <div className="flex flex-col gap-4">
            <div className="flex flex-row items-center justify-center gap-2">
              <span className="font-bold text-lg">POC만의 솔루션</span>
            </div>
            <h2 className="text-4xl font-extrabold text-center">
              행사 기획부터 현장 관리까지
              <br />
              필요한 것만 골라 담아서
            </h2>
            <span className="text-center font-medium text-muted-foreground">
              오프라인 행사를 기획 중이신가요?
              <br />
              도움이 필요한 순간에 POC가 옆에서 도와드립니다.
            </span>
          </div>
          <div className="flex flex-col flex-wrap items-center justify-center md:flex-row gap-10 mt-20">
            <SolutionCard
              cover="/affiliate/poc/images/solution-card-cover-1.png"
              alt="solution 1"
              title={
                <>
                  특별한 행사를 위한 <br />
                  기획하기
                </>
              }
            />
            <SolutionCard
              cover="/affiliate/poc/images/solution-card-cover-2.png"
              alt="solution 2"
              title={
                <>
                  오프라인 행사 <br />
                  공간 찾기
                </>
              }
            />
            <SolutionCard
              cover="/affiliate/poc/images/solution-card-cover-3.png"
              alt="solution 3"
              title={
                <>
                  행사를 빛내줄 <br />
                  협력사 찾기
                </>
              }
            />
          </div>
        </section>
        <section className="flex flex-col my-40">
          <div className=" bg-muted/50 container mx-auto overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <aside className="md:flex-1 py-32">
                <h2 className=" text-4xl font-bold">
                  다양한 기업과의
                  <br />
                  행사 기획부터 개최까지
                </h2>
                <p className=" text-muted-foreground mt-6">
                  저희는 공공기관부터 스포츠 브랜드에 이르기까지
                  <br />
                  다양한 분야의 기업들과 행사를 기획해왔습니다.
                </p>
                <ul className="flex flex-col mt-8 font-medium gap-2 text-muted-foreground">
                  {[
                    "서울특별시 여의나루역 러너스테이션 사업",
                    "한국관광공사 인구감소지역 관광활성화 ‘디주 런트립’",
                    "광진구 주최, 지구 온도 낮추는 ‘2023 함께 뛰는 제로광진 3K’",
                  ].map((it, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <CheckIcon />
                      {it}
                    </li>
                  ))}
                </ul>
              </aside>
              <aside>
                <Image
                  src="/affiliate/poc/images/section-cover-1.png"
                  alt="section 1"
                  width={650}
                  height={400}
                  className="transition-transform duration-200 ease-in-out hover:scale-105"
                />
              </aside>
            </div>
          </div>

          <div>
            <section className="container mx-auto overflow-hidden">
              <div className="flex flex-col md:flex-row">
                <aside className="md:flex-1">
                  <TopBottomFadingGradientOverlay>
                    <Image
                      src="/affiliate/poc/images/section-cover-2.png"
                      alt="section 2"
                      width={650}
                      height={400}
                      className="transition-transform duration-200 ease-in-out hover:scale-105"
                    />
                  </TopBottomFadingGradientOverlay>
                </aside>
                <aside className="md:flex-1 py-32 content-center">
                  <div className="flex flex-col px-32">
                    <h2 className=" text-4xl font-bold">
                      POC와 함께라면
                      <br />
                      정말 쉬운 이벤트 준비
                    </h2>
                    <p className=" text-muted-foreground mt-6">
                      기업 및 브랜드에 알맞은 이벤트 폼으로,
                      <br />
                      고객의 높은 참여율과 편리한 이벤트 관리를 보장할 수
                      있습니다.
                    </p>
                  </div>
                </aside>
              </div>
            </section>
          </div>
          <div className="bg-muted/50 container mx-auto overflow-hidden">
            <div className="flex flex-col md:flex-row">
              <aside className="md:flex-1 py-32 content-center">
                <h2 className=" text-4xl font-bold">오직 여기서만 가능한.</h2>
                <p className=" text-muted-foreground mt-6">
                  오직 POC와 Grida Forms에서만 가능한 것을 체험해보세요.
                  <br />
                  머릿 속에 그리는 것을 현실로 만들어드립니다.
                </p>
                <button className="px-8 py-2 mt-8 rounded-full bg-black font-semibold text-white dark:invert">
                  시작하기
                </button>
              </aside>
              <aside>
                <Image
                  src="/affiliate/poc/images/section-cover-3.png"
                  alt="section 3"
                  width={650}
                  height={400}
                  className="transition-transform duration-200 ease-in-out hover:scale-105"
                />
              </aside>
            </div>
          </div>
        </section>

        <div className="flex flex-col items-center justify-center gap-10 mb-40">
          <span className="font-bold text-lg">Change Our Lives</span>
          <h2 className="text-4xl font-extrabold text-center">
            우리는 함께 즐길 수 있는
            <br />
            문화를 만듭니다.
          </h2>
          <button className=" px-8 py-2 rounded-full bg-black font-semibold text-white dark:invert">
            POC 문의하기
          </button>
        </div>
      </div>
    </main>
  );
}

function TopBottomFadingGradientOverlay({
  children,
}: React.PropsWithChildren<{}>) {
  return (
    <div className="relative">
      {/* Top gradient overlay */}
      <div className="z-50 absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-background to-transparent pointer-events-none" />
      {/* Bottom gradient overlay */}
      <div className="z-50 absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      {/* Content */}
      {children}
    </div>
  );
}

function SolutionCard({
  cover,
  alt,
  title,
}: {
  cover: string;
  alt?: string;
  title: React.ReactNode;
}) {
  return (
    <div className="max-w-sm px-4 py-4 border bg-white/5 border-muted rounded shadow-lg transition-transform duration-200 ease-in-out hover:scale-105">
      <Image
        src={cover}
        alt={alt ?? ""}
        width={400}
        height={400}
        className="w-full h-48 rounded object-cover"
      />
      <p className="font-semibold text-2xl mt-3">{title}</p>
      <div className="flex justify-end text-sm mt-12 opacity-50">
        <button>
          더 알아보기
          <CaretRightIcon className="inline align-middle ms-2" />
        </button>
      </div>
    </div>
  );
}
