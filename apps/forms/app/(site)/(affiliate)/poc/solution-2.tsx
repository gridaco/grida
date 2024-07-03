"use client";

import Image from "next/image";
import React from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import { TopBottomFadingGradientOverlay } from "./gradient";

export function Solutions2() {
  return (
    <section className="flex flex-col my-40">
      <div className=" bg-muted/50 w-full mx-0 sm:px-32 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <aside className="lg:flex-1 py-32">
            <h2 className=" text-4xl font-bold text-center lg:text-left">
              다양한 기업과의
              <br />
              행사 기획부터 개최까지
            </h2>
            <p className=" text-muted-foreground mt-6 text-center lg:text-left">
              저희는 공공기관부터 스포츠 브랜드에 이르기까지
              <br />
              다양한 분야의 기업들과 행사를 기획해왔습니다.
            </p>
            <ul className="flex flex-col mt-8 font-medium gap-2 text-muted-foreground items-center lg:items-start">
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
        <section className="w-full mx-0 sm:px-32 overflow-hidden">
          <div className="flex flex-col-reverse lg:flex-row">
            <aside className="lg:flex-1">
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
              <div className="flex flex-col sm:px-32">
                <h2 className=" text-4xl font-bold text-center lg:text-left">
                  POC와 함께라면
                  <br />
                  정말 쉬운 이벤트 준비
                </h2>
                <p className=" text-muted-foreground mt-6 text-center lg:text-left">
                  기업 및 브랜드에 알맞은 이벤트 폼으로,
                  <br />
                  고객의 높은 참여율과 편리한 이벤트 관리를 보장할 수 있습니다.
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
      <div className="bg-muted/50 w-full mx-0 sm:px-32 overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          <aside className="flex flex-col lg:flex-1 py-32 items-center lg:items-start">
            <h2 className=" text-4xl font-bold text-center lg:text-left">
              오직 여기서만 가능한.
            </h2>
            <p className=" text-muted-foreground mt-6 text-center sm:text-left">
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
  );
}
