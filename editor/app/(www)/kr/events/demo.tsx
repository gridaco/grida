"use client";

import Image from "next/image";
import React from "react";
import clsx from "clsx";
import * as k from "./data";
import { GridaLogo } from "@/components/grida-logo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TopBottomFadingGradientOverlay } from "./gradient";
import bentomainbg from "../../../../public/affiliate/poc/images/bento-fullsize-video-card-background.png";
import { cn } from "@/utils";

export function Demo() {
  return (
    <section className="w-full mx-0 py-40">
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
            defaultValue={k.demo_2_categories[0]}
          >
            <TabsList className="flex flex-wrap h-9 bg-transparent items-center content-center gap-3 justify-center p-1 text-muted-foreground">
              {k.demo_2_categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-black/90 data-[state=active]:text-white data-[state=active]:dark:invert"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
            {k.demo_2_categories.map((category) => (
              <TabsContent key={category} value={category}>
                <div className="container flex flex-col gap-5 px-8">
                  <div className="relative rounded-xl shadow-lg overflow-hidden border">
                    <div className="absolute top-10 left-10 md:top-20 md:left-20">
                      <span className="flex flex-col gap-1">
                        {k.imagesDemo2[category].main.text.map((t, i) => {
                          const islast =
                            i === k.imagesDemo2[category].main.text.length - 1;
                          return (
                            <BentoCardKeyword
                              key={i}
                              className="text-4xl md:text-7xl font-black"
                              steps={
                                islast
                                  ? k.imagesDemo2[category].main
                                      .highlightColorStops
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
                      className=" md:h-[776px] w-full object-cover"
                      src={k.imagesDemo2[category].main.artwork}
                      alt={`${category}-main`}
                      width={1400}
                      height={776}
                    />
                    <Image
                      priority
                      className="absolute inset-0 w-full h-full object-cover -z-10"
                      src={bentomainbg}
                      alt={`${category}-main`}
                      width={1400}
                      height={776}
                    />
                    {/* bento-fullsize-video-card-background.png */}
                  </div>

                  <div className="flex flex-col lg:grid lg:grid-cols-4 gap-5">
                    {k.imagesDemo2[category].subs.map((sub, i) => {
                      return (
                        <BentoCard
                          key={i}
                          artwork={sub.artwork}
                          alt={`${category}-sub2`}
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
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
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
  //
  const gradientClasses = steps
    ? `text-transparent bg-gradient-to-r ${steps.join(" ")} bg-clip-text`
    : "";

  return (
    <span>
      <h1 className={cn(gradientClasses, "inline-block", className)}>
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
    // md:h-[340px] w-full md:col-start-1 md:col-span-2
    <div className={className}>
      <div className="flex flex-col gap-3 p-8">
        <h6 className=" text-xl md:text-4xl font-bold">{text1}</h6>
        <span className="max-w-sm text-sm text-muted-foreground">{text2}</span>
      </div>
      <Image
        className=" hidden md:block absolute right-0 top-0 bottom-0 overflow-hidden object-right-bottom object-cover w-auto h-full -z-10"
        src={artwork}
        alt={alt}
        width={500}
        height={500}
      />
    </div>
  );
}
