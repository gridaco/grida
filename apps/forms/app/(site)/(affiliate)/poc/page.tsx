"use client";

import { GridaLogo } from "@/components/grida-logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Container } from "lucide-react";
import Image from "next/image";

const demo_1_categories = [
  "event",
  "sports",
  "music",
  "fasion",
  "cyber",
  "art",
];

export default function PartnerPOC() {
  return (
    <main>
      <header className="p-4 w-full">
        <div className="flex justify-end w-full">
          <button className="px-8 py-2 rounded bg-black font-semibold text-white">
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
              <button className=" px-8 py-2 rounded-full bg-black font-semibold text-white">
                문의하기
              </button>
            </div>
          </div>
        </section>
        <section className="container mx-auto my-40">
          <div className="gap-20 flex flex-col items-center justify-center">
            <h2 className=" text-lg font-bold">POC와 함께한 브랜드</h2>
            <GridaLogo />
          </div>
        </section>
        <section className="container mx-auto my-40">
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
            <div className="container max-w-full bg-muted">
              <Tabs
                className="flex flex-col items-center justify-center mt-10 gap-10"
                defaultValue={demo_1_categories[0]}
              >
                <TabsList>
                  {demo_1_categories.map((category) => (
                    <TabsTrigger key={category} value={category}>
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
                      width={1000}
                      height={1000}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </div>
        </section>
        <section className="container mx-auto my-40">
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
            <div className="container max-w-full bg-muted">
              <Tabs
                className="flex flex-col items-center justify-center mt-10 gap-10"
                defaultValue={demo_1_categories[0]}
              >
                <TabsList>
                  {demo_1_categories.map((category) => (
                    <TabsTrigger key={category} value={category}>
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
                      width={1000}
                      height={1000}
                    />
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
          <div className="flex flex-col md:flex-row gap-10 mt-12">
            <div className="container px-8 py-8 border border-neutral-200 rounded shadow-lg">
              <div className="container bg-neutral-400 w-full h-48 px-5 rounded">
                ...
              </div>
              <p className="font-semibold text-2xl mt-3">
                특별한 행사를 위한
                <br /> 기획하기
              </p>
              <p className="flex justify-end text-sm mt-12 opacity-50">
                더 알아보기
              </p>
            </div>
            <div className="container px-8 py-8 border border-neutral-200 rounded shadow-lg">
              <div className="container bg-neutral-400 w-full h-48 px-5 rounded">
                ...
              </div>
              <p className="font-semibold text-2xl mt-3">
                오프라인 행사
                <br />
                공간 찾기
              </p>
              <p className="flex justify-end text-sm mt-12 opacity-50">
                더 알아보기
              </p>
            </div>
            <div className="container px-8 py-8 border border-neutral-200 rounded shadow-lg">
              <div className="container bg-neutral-400 w-full h-48 px-5 rounded">
                ...
              </div>
              <p className="font-semibold text-2xl mt-3">
                행사를 빛내줄
                <br /> 협력사 찾기
              </p>
              <p className="flex justify-end text-sm mt-12 opacity-50">
                더 알아보기
              </p>
            </div>
          </div>
        </section>
        <div className="bg-muted">
          <section className="container mx-auto my-40">
            <div className="flex flex-col md:flex-row">
              <aside className="md:flex-1 py-36">
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
              </aside>
              <aside className="md:flex-1 bg-red-300 min-h-40 my-8"></aside>
            </div>
          </section>
        </div>
        <section className="container mx-auto my-40">
          <div>hh</div>
        </section>
        <section className="container mx-auto my-40">
          <div className=" max-w-full bg-muted ">hh</div>
        </section>
        <div className="flex flex-col items-center justify-center gap-10 mb-40">
          <span className="font-bold text-lg">Change Our Lives</span>
          <h2 className="text-4xl font-extrabold text-center">
            우리는 함께 즐길 수 있는
            <br />
            문화를 만듭니다.
          </h2>
          <button className=" px-8 py-2 rounded-full bg-black font-semibold text-white">
            POC 문의하기
          </button>
        </div>
      </div>
    </main>
  );
}
