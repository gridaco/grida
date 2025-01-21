"use client";
import React from "react";
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as k from "@/app/(www-2025)/data";

export function Demo1() {
  return (
    <div className="w-full mx-0">
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
            className="container md:h-[776px] w-full  overflow-hidden"
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
  );
}
