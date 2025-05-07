"use client";
import React from "react";
import { motion } from "motion/react";
import { Button as FancyButton } from "@/www/ui/button";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { WordRotate } from "@/www/ui/word-rotate";
import { sitemap } from "@/www/data/sitemap";
import Link from "next/link";

function HeroBackground() {
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

export default function Hero() {
  return (
    <div
      className="relative py-20 md:py-32"
      role="banner"
      aria-label="SDK Hero Section"
    >
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 20 }}
        transition={{ duration: 5, ease: "easeOut" }}
        className="absolute -z-10 inset-0 flex items-center justify-center"
      >
        <HeroBackground />
      </motion.div>
      <div className="relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            {/* Static text for SEO - hidden visually but readable by search engines */}
            <div
              className="sr-only"
              aria-hidden="true"
              data-seo-content="true"
              itemScope
              itemType="https://schema.org/SoftwareApplication"
            >
              <meta itemProp="name" content="Grida Canvas SDK" />
              <meta itemProp="applicationCategory" content="Developer Tool" />
              <meta itemProp="operatingSystem" content="Web" />
              <meta
                itemProp="offers"
                itemType="https://schema.org/Offer"
                itemScope
                content="Free"
              />
              <div itemProp="description">
                Build Your Own Framer, Figma, Canva With Grida SDK - Open source
                canvas framework for developers
              </div>
            </div>

            {/* Visual text with animation */}
            <h1
              className="text-4xl md:text-6xl font-bold mb-6"
              itemProp="headline"
            >
              Build Your Own
              <WordRotate
                words={[
                  "Canvas",
                  "Framer",
                  "Design Tool",
                  "Website Builder",
                  "AI Editor",
                  "Canva",
                ]}
                aria-label="Design tool alternatives"
              />
            </h1>
            <p
              className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8"
              itemProp="description"
            >
              Integrate powerful canvas capabilities into your application with
              our open-source SDK. Perfect for developers who want to build
              custom canvas experiences.
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href={sitemap.links.github_grida}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="View Grida SDK on GitHub"
              >
                <FancyButton
                  size="lg"
                  icon={ArrowRightIcon}
                  iconPlacement="right"
                  effect="expandIcon"
                >
                  View on GitHub
                </FancyButton>
              </Link>
              <Link
                href={sitemap.links.docs_canvas_sdk}
                aria-label="View Grida SDK Documentation"
              >
                <FancyButton size="lg" variant="outline">
                  Documentation
                </FancyButton>
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
