"use client";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/www/ui/section";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { Marquee } from "@/www/ui/marquee";
import { CalendarIcon } from "@radix-ui/react-icons";

import Footer from "@/www/footer";

export default function WWWPrintingHome() {
  return (
    <main className="overflow-x-hidden">
      <Section container>
        <Hero />
        <div className="absolute right-0 top-0 w-1/2 h-full -z-10">
          <Globe />
        </div>
      </Section>
      <MarqueeDemo />

      <Section container className="mt-40">
        <SectionHeader badge={<GridaLogo />} title={"A"} excerpt={"aa"} />
      </Section>
      <Section container className="mt-40">
        <SectionHeader
          badge={<Badge>Explore</Badge>}
          title={<>Explore Materials & Templates</>}
          excerpt={<>Explore all features & products.</>}
        />
      </Section>
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 h-screen min-h-96 items-start justify-center overflow-visible">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      >
        <div className="flex flex-col items-start text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8 text-center">
            Design to Prints - in 14 Days
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground text-left">
            Hassle free design to production, 14 Day guarantee. Order from
            Nicaragua
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
                <span>Print Now</span>
              </FancyButton>
            </Link>

            <Link href={sitemap.links.database}>
              <Button
                variant="outline"
                className="border-none shadow-none bg-transparent"
              >
                <CalendarIcon className="me-2" />
                Book a call
              </Button>
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

function Globe({
  className,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement>) {
  return (
    <iframe
      {...props}
      src="https://bg.grida.co/embed/globe"
      className={cn("w-full h-full border-none bg-transparent", className)}
      allowFullScreen
      allowTransparency={true}
    />
  );
}

const reviews = [
  {
    name: "Jack",
    username: "@jack",
    body: "I've never seen anything like this before. It's amazing. I love it.",
    img: "https://avatar.vercel.sh/jack",
  },
  {
    name: "Jill",
    username: "@jill",
    body: "I don't know what to say. I'm speechless. This is amazing.",
    img: "https://avatar.vercel.sh/jill",
  },
  {
    name: "John",
    username: "@john",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "https://avatar.vercel.sh/john",
  },
  {
    name: "Jane",
    username: "@jane",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "https://avatar.vercel.sh/jane",
  },
  {
    name: "Jenny",
    username: "@jenny",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "https://avatar.vercel.sh/jenny",
  },
  {
    name: "James",
    username: "@james",
    body: "I'm at a loss for words. This is amazing. I love it.",
    img: "https://avatar.vercel.sh/james",
  },
];

const firstRow = reviews.slice(0, reviews.length / 2);
const secondRow = reviews.slice(reviews.length / 2);

const ReviewCard = ({
  img,
  name,
  username,
  body,
}: {
  img: string;
  name: string;
  username: string;
  body: string;
}) => {
  return (
    <figure
      className={cn(
        "relative h-full w-64 cursor-pointer overflow-hidden rounded-xl border p-4",
        // light styles
        "border-gray-950/[.1] bg-gray-950/[.01] hover:bg-gray-950/[.05]",
        // dark styles
        "dark:border-gray-50/[.1] dark:bg-gray-50/[.10] dark:hover:bg-gray-50/[.15]"
      )}
    >
      <div className="flex flex-row items-center gap-2">
        <img className="rounded-full" width="32" height="32" alt="" src={img} />
        <div className="flex flex-col">
          <figcaption className="text-sm font-medium dark:text-white">
            {name}
          </figcaption>
          <p className="text-xs font-medium dark:text-white/40">{username}</p>
        </div>
      </div>
      <blockquote className="mt-2 text-sm">{body}</blockquote>
    </figure>
  );
};

function MarqueeDemo() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:20s]">
        {firstRow.map((review) => (
          <ReviewCard key={review.username} {...review} />
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background"></div>
    </div>
  );
}
