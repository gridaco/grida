"use client";
import Header from "@/www/header";
import React, { useState } from "react";
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
import Image from "next/image";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
      <Section container>
        <SectionHeader badge={<GridaLogo />} title={"A"} excerpt={"aa"} />
      </Section>
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
            Your visual Data backend
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground text-left">
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
    name: "Page 1",
    src: "/www/.database/1.png",
  },
  {
    name: "Page 2",
    src: "/www/.database/2.png",
  },
  {
    name: "Page 3",
    src: "/www/.database/3.png",
  },
  {
    name: "Page 4",
    src: "/www/.database/4.png",
  },
  {
    name: "Page 5",
    src: "/www/.database/5.png",
  },
];

function SectionMainDemo() {
  const [index, setIndex] = useState<number>(0);

  const data = tabs[index];

  return (
    <div>
      <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative">
        <Image src={data.src} alt={data.name} width={1320} height={792} />
      </Card>
      <Tabs
        value={index + ""}
        onValueChange={(s) => {
          setIndex(parseInt(s));
        }}
        className="w-min mx-auto mt-4"
      >
        <TabsList>
          {tabs.map(({ name }, i) => (
            <TabsTrigger key={i} value={i + ""}>
              {name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
