"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import * as k from "./data";
import clsx from "clsx";
import bentomainbg from "@/app/(www)/(home)/.home/bento-fullsize-video-card-background.png";

export function Demo2() {
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
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
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
          {k.demo_2_categories.map((category, index) => (
            <button
              key={category}
              ref={(el) => (tabsRef.current[index] = el)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-4 py-1 text-lg font-normal transition-all ${
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
                {k.imagesDemo2[
                  k.demo_2_categories[activeTabIndex]
                ].main.text.map((t, i) => {
                  const isLast =
                    i ===
                    k.imagesDemo2[k.demo_2_categories[activeTabIndex]].main.text
                      .length -
                      1;
                  return (
                    <BentoCardKeyword
                      key={i}
                      className="text-4xl md:text-7xl font-black"
                      steps={
                        isLast
                          ? k.imagesDemo2[k.demo_2_categories[activeTabIndex]]
                              .main.highlightColorStops
                          : undefined
                      }
                    >
                      {t}
                    </BentoCardKeyword>
                  );
                })}
              </span>
            </div>
            <Image
              priority
              className="md:h-[776px] w-full object-cover"
              src={
                k.imagesDemo2[k.demo_2_categories[activeTabIndex]].main.artwork
              }
              alt={`${k.demo_2_categories[activeTabIndex]}-main`}
              width={1400}
              height={776}
            />
            <Image
              priority
              className="absolute inset-0 w-full h-full object-cover -z-10"
              src={bentomainbg}
              alt={`${k.demo_2_categories[activeTabIndex]}-main`}
              width={1400}
              height={776}
            />
          </div>

          <div className="flex flex-col lg:grid lg:grid-cols-4 gap-5">
            {k.imagesDemo2[k.demo_2_categories[activeTabIndex]].subs.map(
              (sub, i) => {
                return (
                  <BentoCard
                    key={i}
                    artwork={sub.artwork}
                    alt={`${k.demo_2_categories[activeTabIndex]}-sub2`}
                    text1={sub.title}
                    text2={sub.description}
                    className={clsx(
                      "relative rounded-xl shadow-lg w-full border overflow-hidden",
                      "md:h-[320px]",
                      i === 0 ? "lg:col-start-1 lg:col-span-2" : ""
                    )}
                  />
                );
              }
            )}
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
