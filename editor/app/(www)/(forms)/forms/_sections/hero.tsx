"use client";

import { Button } from "@/components/ui/button";
import { sitemap } from "@/www/data/sitemap";
import { Button as FancyButton } from "@/www/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-[calc(100vh-100px)] min-h-[500px] items-center justify-center overflow-visible">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      >
        <div className="flex flex-col items-center text-center">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8 text-center">
            Forms for Hackers
          </h1>
          <p className="max-w-lg text-sm md:text-base text-muted-foreground text-center">
            Grida Forms combines powerful APIs for developers with intuitive,
            marketer-friendly features—empowering teams to quickly build,
            customize, and launch forms that drive conversions, automate
            workflows, and integrate seamlessly into your existing tools.
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

            <Link href={sitemap.links.forms_ai} target="_blank">
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
