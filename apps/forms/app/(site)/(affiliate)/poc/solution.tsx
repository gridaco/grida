"use client";

import Image from "next/image";
import React from "react";
import { CaretRightIcon, CheckIcon } from "@radix-ui/react-icons";

export function Solutions() {
  return (
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
