"use client";

import { GridaLogo } from "@/components/grida-logo";
import Image from "next/image";
import Link from "next/link";
import React from "react";
import { TopBottomFadingGradientOverlay } from "./gradient";
import BgSvg from "./bg-color-animate";

const imageUrls = [
  [
    "/affiliate/poc/images/main-section/main-card-image-1.png",
    "/affiliate/poc/images/main-section/main-card-image-2.png",
  ],
  [
    "/affiliate/poc/images/main-section/main-card-image-3.png",
    "/affiliate/poc/images/main-section/main-card-image-4.png",
    "/affiliate/poc/images/main-section/main-card-image-5.png",
  ],
  [
    "/affiliate/poc/images/main-section/main-card-image-1.png",
    "/affiliate/poc/images/main-section/main-card-image-2.png",
  ],
];

export function Hero() {
  return (
    <section className="flex min-h-screen max-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-[-50]">
        <BgSvg />
      </div>
      <div className="absolute inset-0 z-[-50]">
        <Image
          src="/affiliate/poc/images/bg-grid.png"
          alt="Background Grid"
          width={1000}
          height={1000}
          className="w-full h-full object-cover"
        />
      </div>
      {/* <div
        aria-hidden="true"
        className="pointer-events-none lg:absolute lg:inset-y-0 lg:mx-auto lg:w-full lg:max-w-7xl"
      >
        <div className="absolute transform sm:left-1/2 sm:top-0 sm:translate-x-8 lg:left-1/2 lg:top-1/2 lg:-translate-y-1/2 lg:translate-x-[250px]">
          <ImageGrid />
        </div>
      </div> */}

      <aside className="flex flex-1">
        {/*  */}
        <div className="sm:pl-20 flex-1 flex items-center justify-center sm:justify-start">
          <div className="flex flex-col items-center sm:items-start gap-10">
            <div className="flex items-center justify-center gap-2">
              <GridaLogo />
              <span className="font-bold text-lg">Affiliate</span>
            </div>
            <h1 className="text-4xl font-bold text-start">
              Grida forms로 <br />
              편리한 이벤트 준비
            </h1>
            <Link href={"/contact"}>
              <button className=" px-8 py-2 rounded-full bg-black font-semibold text-white dark:invert">
                문의하기
              </button>
            </Link>
          </div>
        </div>
      </aside>
      <TopBottomFadingGradientOverlay className="overflow-hidden -z-50">
        <aside className="absolute lg:relative flex-1">
          <div className="translate-x-1/4 xl:translate-x-10">
            <ImageGrid />
          </div>
        </aside>
      </TopBottomFadingGradientOverlay>
    </section>
  );
}

const ImageGrid = () => {
  return (
    <div className="flex items-center space-x-6 lg:space-x-8">
      {imageUrls.map((column, colIndex) => (
        <div
          key={colIndex}
          className="grid flex-shrink-0 grid-cols-1 gap-y-6 lg:gap-y-8"
        >
          {column.map((src, index) => (
            <div key={index} className=" h-96 w-72 overflow-hidden rounded-lg">
              <Image
                src={src}
                alt=""
                className="h-full w-full object-cover object-center"
                width={320}
                height={520}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
