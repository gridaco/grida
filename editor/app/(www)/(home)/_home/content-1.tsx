"use client";
import React from "react";
import Image from "next/image";
import { Carousel, CarouselContent, CarouselItem } from "@/www/ui/carousel";
import { type CarouselApi } from "@/www/ui/carousel";
import Autoplay from "embla-carousel-autoplay";
import { cn } from "@/utils";
import { motion } from "framer-motion";

import __src_1 from "@/public/www/.home/pixel-drawing.png";
import __src_2 from "@/public/www/.home/ux-ui-builder.png";
import __src_3 from "@/public/www/.home/icon-shape-templates.png";
import __src_4 from "@/public/www/.home/ai-copywriter.png";
import __src_5 from "@/public/www/.home/text-editor.png";

const categories = [
  "Free Pixel drawing",
  "UI/UX Builder",
  "Icon & Shape Templates",
  "AI Copywriter",
  "Text editor",
];

const images = {
  "Free Pixel drawing": __src_1,
  "UI/UX Builder": __src_2,
  "Icon & Shape Templates": __src_3,
  "AI Copywriter": __src_4,
  "Text editor": __src_5,
};

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

  const img = images[categories[index] as keyof typeof images];

  return (
    <div className="flex flex-col items-center gap-4 sm:gap-6 md:gap-10">
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
        className="w-52 md:w-64 overflow-visible"
      >
        <CarouselContent>
          {categories.map((item, i) => (
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
      <div className="min-h-96 h-[300px] sm:h-[400px] md:h-[600px] lg:h-[800px] w-full flex items-start justify-center">
        <BigImageContainer key={index} {...img} alt={categories[index]} />
      </div>
    </div>
  );
}

function BigImageContainer({
  width,
  height,
  alt = "",
  ...props
}: React.ComponentProps<typeof Image>) {
  return (
    <motion.div
      className="rounded-xl border bg-card text-card-foreground shadow overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <Image {...props} width={width} height={height} alt={alt} />
    </motion.div>
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
        "text-sm md:text-base rounded-lg bg-background flex py-3 md:py-4 items-center justify-center transition-all group select-none cursor-pointer",
        selected
          ? "bg-white dark:bg-slate-950 dark:text-white text-black border border-slate-100 dark:border-slate-700 shadow-md shadow-slate-200 dark:shadow-none"
          : "bg-transparent text-muted-foreground"
      )}
    >
      <span className="text-center ">{label}</span>
    </div>
  );
}
