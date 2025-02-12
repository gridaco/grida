import React from "react";
import { Button } from "@/components/ui/button";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen min-h-96 items-center justify-center overflow-visible">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
        className="text-black dark:text-white"
      >
        <div className="flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8 text-center">
            The Free, <span className="whitespace-nowrap">Open Canvas</span>
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground text-center">
            Grida is an Open source Canvas where you can design & build web
            applications with templates
          </p>
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
            viewport={{ once: true }}
            className="flex gap-4 mt-16"
          >
            <Link href={sitemap.links.cta}>
              <FancyButton
                effect="expandIcon"
                className="flex gap-2 group"
                icon={ArrowRight}
                iconPlacement="right"
              >
                <span>Start your project</span>
              </FancyButton>
            </Link>

            <Link href={sitemap.links.canvas}>
              <Button
                variant="outline"
                className="border-none shadow-none bg-transparent"
              >
                Try the demo
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

export function HeroBackground() {
  const path =
    "M6.1912 307.719C-28.0369 229.284 87.9827 154.311 150.271 126.63C322.143 -54.4597 724.031 9.92764 929.546 16.1469C1135.06 22.3661 990.981 163.214 1119.7 329.304C1248.42 495.394 1006.34 581 960.263 669.898C914.187 758.797 589.093 602.218 494.015 669.898C398.937 737.578 168.555 623.803 171.847 470.517C175.138 317.231 48.9763 405.764 6.1912 307.719Z";
  return (
    <div className="absolute -top-40">
      <svg
        width={"1157"}
        height="698"
        viewBox="0 0 1157 698"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible [--gradient:url(#light)] dark:[--gradient:url(#dark)]"
      >
        <filter id="blur" x="-50%" y="-50%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="200" />
        </filter>
        <defs>
          <radialGradient
            id="light"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(579 236) rotate(85) scale(522 865)"
          >
            <stop stopColor="#CDBAFF" />
            <stop stopColor="#A06EFF" stopOpacity="1" />
            <stop offset="0.36" stopColor="#8298FF" stopOpacity="1" />{" "}
            <stop offset="0.61" stopColor="#60CFFF" stopOpacity="0.9" />{" "}
            <stop offset="1" stopColor="#9EF3E8" stopOpacity="0.8" />{" "}
          </radialGradient>
          <radialGradient
            id="dark"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(579 236) rotate(85) scale(522 865)"
          >
            <stop stopColor="#4F3791" />
            <stop offset="0.36" stopColor="#425397" />
            <stop offset="0.61" stopColor="#3383A0" />
            <stop offset="1" stopColor="#34D7C4" />
          </radialGradient>
        </defs>
        <path d={path} fill="var(--gradient)" filter="url(#blur)" />
      </svg>
    </div>
  );
}
