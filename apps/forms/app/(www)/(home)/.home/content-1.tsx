"use client";
import React from "react";
import Image from "next/image";
import { Carousel, CarouselContent, CarouselItem } from "@/www/ui/carousel";
import { type CarouselApi } from "@/www/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { cn } from "@/utils";
import { motion } from "framer-motion";
import * as k from "./data";

export default function Content1() {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const index = current - 1;

  React.useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  return (
    <div className="flex flex-col items-center my-16 gap-10">
      {/* tabs */}
      <Carousel
        setApi={setApi}
        opts={{
          align: "center",
        }}
        plugins={[
          Autoplay({
            delay: 4000,
          }),
        ]}
        className="w-full max-w-sm overflow-visible"
      >
        <CarouselContent>
          {k.demo_1_categories.map((item, i) => (
            <CarouselItem
              key={i}
              onClick={() => {
                api?.scrollTo(i, false);
              }}
            >
              <Trigger label={item} selected={index === i} />
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      {/* body */}
      <div className="container w-full aspect-video overflow-hidden">
        <motion.div
          className="w-full h-full"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <Image
            className="w-full h-full object-cover"
            src={
              k.imagesDemo1[
                k.demo_1_categories[index] as keyof typeof k.imagesDemo1
              ]
            }
            alt={k.demo_1_categories[index]}
            width={1400}
            height={900}
          />
        </motion.div>
      </div>
    </div>
  );
}

function Trigger({
  label,
  selected,
}: {
  label: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      data-selected={selected}
      className={cn(
        "rounded bg-background flex p-4 items-center justify-center transition-all group",
        selected
          ? "bg-background dark:text-white text-black border border-slate-100 shadow-lg shadow-slate-300"
          : "bg-transparent text-muted-foreground"
      )}
    >
      <span className="text-center ">
        {label} {`${selected}`}
      </span>
    </div>
  );
}
