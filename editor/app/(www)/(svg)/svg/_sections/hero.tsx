"use client";

import React from "react";
import { motion } from "motion/react";
import { Button as FancyButton } from "@/www/ui/button";
import { Button } from "@app/ui/components/button";
import { ArrowRight } from "lucide-react";
import { sitemap } from "@/www/data/sitemap";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 min-h-[68vh] items-center justify-center">
      <div className="flex flex-col items-center text-center">
        {/* Staggered headline */}
        <div className="overflow-hidden pb-1">
          <motion.h1
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl md:text-5xl lg:text-7xl font-bold text-center leading-[1.08]"
          >
            The clean
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
            SVG editor.
          </motion.h1>
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="max-w-xl text-sm md:text-base text-muted-foreground text-center mt-8"
        >
          Open an SVG, change one thing, save — and the diff shows exactly that.
          Nothing else moves. A round-trip-faithful editor and headless SDK, for
          the era when people and AI edit the same files.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="flex gap-4 mt-12"
        >
          <Link href={sitemap.links.svg_editor}>
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
