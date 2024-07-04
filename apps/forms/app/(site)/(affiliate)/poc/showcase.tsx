"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Image from "next/image";
import React from "react";
import * as k from "./data";

export function ShowCase() {
  return (
    <section className="py-40">
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-center">
            <span className="font-bold text-lg">
              <span className="opacity-50 me-2">최대 30%</span>POC만의 할인된
              가격에
            </span>
          </div>
          <h2 className="text-4xl font-extrabold text-center px-20 sm:px-0">
            브랜드를 가장 잘 담는 나만의 폼 빌더
          </h2>
        </header>
        <div className="w-full mx-0 bg-muted/50 px-8 sm:px-24">
          <Tabs
            className="flex flex-col items-center justify-center my-16 gap-10"
            defaultValue={k.demo_1_categories[0]}
          >
            <TabsList className="flex flex-wrap bg-transparent h-9 items-center content-center gap-3 justify-center text-muted-foreground">
              {k.demo_1_categories.map((category) => (
                <TabsTrigger
                  key={category}
                  value={category}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-black/90 data-[state=active]:text-white data-[state=active]:dark:invert"
                >
                  {category}
                </TabsTrigger>
              ))}
            </TabsList>
            {k.demo_1_categories.map((category) => (
              <TabsContent
                key={category}
                value={category}
                className="container bg-background md:h-[776px] w-full rounded-xl shadow-xl overflow-hidden"
              >
                <Image
                  className="w-full h-full object-cover"
                  src={k.imagesDemo1[category as keyof typeof k.imagesDemo1]}
                  alt={category}
                  width={1400}
                  height={776}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
    </section>
  );
}
