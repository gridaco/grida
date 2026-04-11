"use client";

import React from "react";
import { motion } from "motion/react";
import { Button as FancyButton } from "@/www/ui/button";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { sitemap } from "@/www/data/sitemap";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen min-h-96 items-center justify-center overflow-visible">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 20 }}
        transition={{ duration: 5, ease: "easeOut" }}
        className="absolute -z-10 inset-0 flex items-center justify-center"
      >
        <HeroBackground />
      </motion.div>
      <div className="flex flex-col items-center text-center">
        {/* Staggered headline */}
        <div className="overflow-hidden pb-1">
          <motion.h1
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl md:text-5xl lg:text-7xl font-bold text-center leading-[1.08]"
          >
            Presentation design,
          </motion.h1>
        </div>
        <div className="overflow-hidden pb-1">
          <motion.h1
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{
              duration: 0.7,
              ease: [0.22, 1, 0.36, 1],
              delay: 0.1,
            }}
            className="text-4xl md:text-5xl lg:text-7xl font-bold text-center whitespace-nowrap leading-[1.08]"
          >
            rethought.
          </motion.h1>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="max-w-lg text-sm md:text-base text-muted-foreground text-center mt-8"
        >
          A vector-native workspace for teams creating polished, scalable
          decks.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex gap-4 mt-12"
        >
          <Link href={sitemap.links.slides}>
            <FancyButton
              effect="expandIcon"
              className="flex gap-2 group"
              icon={ArrowRight}
              iconPlacement="right"
            >
              <span>Try the editor</span>
            </FancyButton>
          </Link>
          <Link
            href={sitemap.links.github_grida}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              className="border-none shadow-none bg-transparent"
            >
              GitHub
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

function HeroBackground() {
  const path =
    "M6.1912 307.719C-28.0369 229.284 87.9827 154.311 150.271 126.63C322.143 -54.4597 724.031 9.92764 929.546 16.1469C1135.06 22.3661 990.981 163.214 1119.7 329.304C1248.42 495.394 1006.34 581 960.263 669.898C914.187 758.797 589.093 602.218 494.015 669.898C398.937 737.578 168.555 623.803 171.847 470.517C175.138 317.231 48.9763 405.764 6.1912 307.719Z";
  return (
    <div className="absolute -top-40">
      <svg
        width="1157"
        height="698"
        viewBox="0 0 1157 698"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible [--gradient:url(#slides-hero-light)] dark:[--gradient:url(#slides-hero-dark)]"
      >
        <filter id="slides-blur" x="-50%" y="-50%" width="300%" height="300%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="200" />
        </filter>
        <defs>
          <radialGradient
            id="slides-hero-light"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(579 236) rotate(85) scale(522 865)"
          >
            <stop stopColor="#FFE0B2" />
            <stop offset="0.36" stopColor="#FFAB91" stopOpacity="0.9" />
            <stop offset="0.61" stopColor="#FF8A65" stopOpacity="0.7" />
            <stop offset="1" stopColor="#FF7043" stopOpacity="0.5" />
          </radialGradient>
          <radialGradient
            id="slides-hero-dark"
            cx="0"
            cy="0"
            r="1"
            gradientUnits="userSpaceOnUse"
            gradientTransform="translate(579 236) rotate(85) scale(522 865)"
          >
            <stop stopColor="#4A2C1A" />
            <stop offset="0.36" stopColor="#3E1F0F" />
            <stop offset="0.61" stopColor="#2D1810" />
            <stop offset="1" stopColor="#1A0F0A" />
          </radialGradient>
        </defs>
        <path d={path} fill="var(--gradient)" filter="url(#slides-blur)" />
      </svg>
    </div>
  );
}
