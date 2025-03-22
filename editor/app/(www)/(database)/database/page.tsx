"use client";
import Header from "@/www/header";
import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/www/ui/section";
import { GridaLogo } from "@/components/grida-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import FooterWithCTA from "@/www/footer-with-cta";
import { FormPageBackground } from "@/scaffolds/e/form/background";

export default function A() {
  return (
    <main className="overflow-x-hidden">
      <Header />
      <Section container>
        <Hero />
      </Section>
      <Section container className="-mt-28 md:-mt-48 relative z-10">
        <SectionMainDemo />
      </Section>
      <div className="h-96" />
      <FormPageBackground
        type="background"
        element="iframe"
        src="https://bg.grida.co/embed/dots"
      />
      <FooterWithCTA />
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
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8">
            Your visual Data backend
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground">
            Grida empowers you to build no-code databases as easily as editing a
            spreadsheet. Plug in your own database, choose ours, or integrate
            with Supabase—millions of rows, no problem. Your data. Your rules.
            You&apos;re in control.
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

            {/* <Link href={sitemap.links.database}>
              <Button
                variant="outline"
                className="border-none shadow-none bg-transparent"
              >
                Try the demo
              </Button>
            </Link> */}
          </motion.div>
        </div>
      </motion.div>
    </section>
  );
}

const tabs: { name: string; src: string }[] = [
  {
    name: "Analyze",
    src: "/www/.database/1.png",
  },
  {
    name: "CMS",
    src: "/www/.database/2.png",
  },
  {
    name: "Build",
    src: "/www/.database/3.png",
  },
  {
    name: "Report",
    src: "/www/.database/4.png",
  },
  {
    name: "Filter",
    src: "/www/.database/5.png",
  },
];

function SectionMainDemo() {
  const [index, setIndex] = useState<number>(0);

  const data = tabs[index];
  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % tabs.length);
    }, 3000); // 3초마다 변경

    return () => clearInterval(interval);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.0, ease: "easeOut" }}
    >
      <div>
        <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative">
          <motion.div
            key={data.src} // key 변경 시 새로운 애니메이션 실행
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="w-full h-full"
          >
            <Image
              src={data.src}
              alt={data.name}
              width={1320}
              height={792}
              className="w-full h-full object-cover object-left-top md:object-top"
            />
          </motion.div>
        </Card>
        <div className="flex justify-center mt-8 gap-2">
          {tabs.map(({ name }, i) => (
            <div key={i} onClick={() => setIndex(i)} className="cursor-pointer">
              <Trigger label={name} selected={index === i} />
            </div>
          ))}
        </div>
      </div>
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
        "text-sm md:text-base rounded-lg bg-background flex py-2 px-4 items-center justify-center transition-all group select-none",
        selected
          ? "bg-white dark:bg-slate-950 dark:text-white text-black border border-slate-100 dark:border-slate-700 shadow-md shadow-slate-200 dark:shadow-none"
          : "bg-transparent text-muted-foreground hover:bg-accent"
      )}
    >
      <span className="text-center">{label}</span>
    </div>
  );
}
