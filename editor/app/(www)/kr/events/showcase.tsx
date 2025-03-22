"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import React from "react";
import * as k from "./data";

export function ShowCase() {
  const [selectedCategory, setSelectedCategory] = React.useState(
    k.demo_1_categories[0]
  );
  return (
    <section className="py-40">
      <div className="flex flex-col gap-10">
        <header className="flex flex-col gap-4">
          <div className="flex flex-row items-center justify-center">
            <span className="font-bold text-lg">
              <span className="opacity-50 me-2">최대 30%</span> 할인된 가격에
            </span>
          </div>
          <h2 className="text-4xl font-extrabold text-center px-20 sm:px-0">
            브랜드를 가장 잘 담는 나만의 폼 빌더
          </h2>
        </header>
        <div className="w-full mx-0 bg-muted/50 px-8 sm:px-24">
          <Tabs
            className="flex flex-col items-center justify-center my-16 gap-10"
            value={selectedCategory}
            onValueChange={setSelectedCategory}
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
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedCategory}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="container bg-background md:h-[776px] w-full rounded-xl shadow-xl overflow-hidden"
              >
                <Image
                  className="w-full h-full object-cover"
                  width={500}
                  height={500}
                  src={
                    k.imagesDemo1[
                      selectedCategory as keyof typeof k.imagesDemo1
                    ]
                  }
                  alt={selectedCategory}
                />
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </div>
      </div>
    </section>
  );
}
