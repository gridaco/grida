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
import Image from "next/image";
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
            <Link href="/print/~/order">
              <FancyButton
                effect="expandIcon"
                className="flex group"
                icon={ArrowRight}
                iconPlacement="right"
              >
                <span>Print Now</span>
              </FancyButton>
            </Link>

            <Link href="/print/~/contact">
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

const marqueeitems = [
  {
    name: "01",
    img: "/www/.print/categories/01.png",
  },
  {
    name: "02",
    img: "/www/.print/categories/02.png",
  },
  {
    name: "03",
    img: "/www/.print/categories/03.png",
  },
  {
    name: "04",
    img: "/www/.print/categories/04.png",
  },
  {
    name: "05",
    img: "/www/.print/categories/05.png",
  },
  {
    name: "06",
    img: "/www/.print/categories/06.png",
  },
];

const MarqueeCard = ({ img, name }: { img: string; name: string }) => {
  return (
    <figure
      className={cn(
        "relative w-56 aspect-[4/3] cursor-pointer overflow-hidden rounded-xl border",
        // light styles
        "border-gray-950/[.1] bg-gray-950/[.01] hover:bg-gray-950/[.05]",
        // dark styles
        "dark:border-gray-50/[.1] dark:bg-gray-50/[.10] dark:hover:bg-gray-50/[.15]"
      )}
    >
      <Image
        className="object-cover"
        src={img}
        width={400}
        height={300}
        alt={name}
      />
    </figure>
  );
};

function MarqueeDemo() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:20s]">
        {marqueeitems.map((item) => (
          <Link key={item.name} href="/print/~/templates">
            <MarqueeCard {...item} />
          </Link>
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background"></div>
    </div>
  );
}
