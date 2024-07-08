"use client";

import { Logos } from "./logos";
import React from "react";
import { Hero } from "./hero";
import { Solutions } from "./solution";
import { Solutions2 } from "./solution-2";
import { ShowCase } from "./showcase";
import { Demo } from "./demo";
import Footer from "@/www/footer";

export default function PartnerPOC() {
  return (
    <main>
      <div className=" relative z-10">
        <header className="absolute top-0 left-0 right-0 z-50">
          <div className="py-10 px-20 w-full">
            <div className="flex justify-end w-full">
              <button className="px-8 py-2 rounded bg-black font-semibold text-white dark:invert">
                시작하기
              </button>
            </div>
          </div>
        </header>
        <Hero />
        <section className="container my-40">
          <div className="gap-10 flex flex-col items-center justify-center">
            <h2 className=" text-lg font-bold">POC와 함께한 브랜드</h2>
            <Logos />
          </div>
        </section>
        <ShowCase />
        <Demo />
        <Solutions />
        <Solutions2 />
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
      <Footer />
    </main>
  );
}
