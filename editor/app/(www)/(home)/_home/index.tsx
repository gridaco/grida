"use client";
import React, { useState } from "react";
import Image from "next/image";
import Header from "@/www/header";
import Hero, { HeroBackground } from "@/app/(www)/(home)/_home/hero";
import Content1 from "./content-1";
import Content3 from "./content-3";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { cn } from "@/components/lib/utils";
import { Pixelify_Sans } from "next/font/google";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section, SectionHeader, SectionHeaderBadge } from "@/www/ui/section";

const pixelify = Pixelify_Sans({ subsets: ["latin"] });

export default function HomePage() {
  return (
    <main className="overflow-x-hidden">
      <Header />
      <div className="w-full relative">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 20 }}
          transition={{ duration: 5, ease: "easeOut" }}
          className="absolute -z-10 inset-0 flex items-center justify-center"
        >
          <HeroBackground />
        </motion.div>
        <Section container className="overflow-visible">
          <Hero />
        </Section>
      </div>
      <Section container className="-mt-28 md:-mt-48">
        <SectionMainDemo />
      </Section>
      {/* <Section container className="mt-40">
          <SectionC />
        </Section> */}
      <Section container className="mt-32">
        <SectionA />
      </Section>
      <Section container className="mt-32">
        <SectionD />
      </Section>
      <Section container className="mt-32">
        <SectionB />
      </Section>
      <FooterWithCTA />
    </main>
  );
}

function SectionMainDemo() {
  const [isLocked, setIsLocked] = useState(true);

  const unlockDemo = () => {
    setIsLocked(false);
  };

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 50,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        delay: 0.5,
        duration: 1.5,
        ease: "easeOut",
      }}
    >
      <Card className="mx-auto p-0 max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative">
        {/* Overlay for lock */}
        {isLocked && (
          <div
            className="absolute inset-0 from-background/80 to-background/20 bg-gradient-to-t z-20 flex items-center justify-center cursor-pointer"
            onClick={unlockDemo}
          >
            <Button>Try it out</Button>
          </div>
        )}
        <div
          data-locked={isLocked}
          className="w-full h-full pointer-events-none data-[locked='false']:pointer-events-auto"
        >
          <iframe src="/www-embed/demo-canvas" className="w-full h-full" />
        </div>
      </Card>
    </motion.div>
  );
}

function SquareCard({
  title,
  background,
  foreground,
  href,
  excerpt,
}: {
  background: React.ReactNode;
  foreground: React.ReactNode;
  href: string;
  title: string;
  excerpt: string;
}) {
  return (
    <Link href={href} className="w-full flex flex-col gap-3 lg:gap-4 group">
      <div className="relative w-full aspect-square rounded-sm shadow border overflow-hidden">
        <span className="absolute w-full h-full -z-10">{background}</span>
        <span className="absolute z-10">{foreground}</span>
      </div>
      <div className="flex flex-col">
        <p className="md:text-lg font-medium">{title}</p>
        <p className="text-xs md:text-sm text-muted-foreground">{excerpt}</p>
      </div>
    </Link>
  );
}

function SectionA() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={<SectionHeaderBadge>Canvas</SectionHeaderBadge>}
        title={
          <>
            <span>From websites to</span>{" "}
            <span
              className={cn(
                // "border border-foreground px-4",
                pixelify.className
              )}
            >
              <br /> Pixel arts
            </span>
          </>
        }
        excerpt={
          "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
        }
        button={
          <Link href={sitemap.links.canvas}>
            <Button variant="link" className="mt-20">
              Open your Canvas
              <ArrowRightIcon className="size-5" />
            </Button>
          </Link>
        }
      />
      <div className="relative">
        <div className="absolute inset-0 -z-10 flex justify-center items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-full aspect-square overflow-visible"
          >
            <defs>
              <radialGradient
                id="blueCircle"
                cx="50%"
                cy="50%"
                r="50%"
                fx="50%"
                fy="50%"
              >
                <stop offset="0%" stopColor="rgba(135, 206, 250, 0.5)" />
                <stop offset="100%" stopColor="rgba(135, 206, 250, 0)" />
              </radialGradient>
            </defs>
            <circle cx="700" cy="700" r="700" fill="url(#blueCircle)" />
          </svg>
        </div>
        <div className="w-full mx-0 my-10 md:my-40">
          <Content1 />
        </div>
      </div>
    </section>
  );
}

function SectionB() {
  return (
    <section className="my-60">
      <SectionHeader
        badge={<SectionHeaderBadge>Explore</SectionHeaderBadge>}
        title={
          <>
            Right tools for the{" "}
            <span className=" whitespace-nowrap">right job</span>
          </>
        }
        excerpt={<>Explore all features & products.</>}
      />
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut", delay: 0.2 }}
        className="grid grid-cols-2 gap-5 lg:flex lg:flex-row lg:gap-6 items-start justify-center mt-16 md:mt-32"
      >
        <SquareCard
          href={sitemap.links.canvas}
          background={
            <>
              <Image
                src="/www/.home/section-b/canvas-card.png"
                alt="card"
                width={1000}
                height={1000}
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-110"
              />
            </>
          }
          foreground={
            <div className="relative top-3 left-3 md:top-6 md:left-6  text-xl md:text-3xl font-semibold text-white/90">
              Canvas
            </div>
          }
          title={"Canvas"}
          excerpt={"Design Components and Websites"}
        />
        <SquareCard
          href={sitemap.links.forms}
          background={
            <>
              <Image
                src="/www/.home/section-b/forms-card.png"
                alt="card"
                width={1000}
                height={1000}
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-110"
              />
            </>
          }
          foreground={
            <div className="relative top-3 left-3 md:top-6 md:left-6 text-xl md:text-3xl font-semibold text-white/90">
              Forms
            </div>
          }
          title={"Forms"}
          excerpt={"Get user responses, Launch MVP"}
        />
        <SquareCard
          href={sitemap.links.database}
          background={
            <>
              <Image
                src="/www/.home/section-b/database-card.png"
                alt="card"
                width={1000}
                height={1000}
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-110"
              />
            </>
          }
          foreground={
            <div className="relative top-3 left-3 md:top-6 md:left-6 text-xl md:text-3xl  font-semibold text-white/90">
              Database
            </div>
          }
          title={"Database"}
          excerpt={"Manage data, create pipelines & endpoints"}
        />
        <SquareCard
          href={sitemap.links.thebundle}
          background={
            <>
              <Image
                src="/www/.home/section-b/thebundle-card.png"
                alt="card"
                width={1000}
                height={1000}
                className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-110"
              />
            </>
          }
          foreground={
            <div className="relative top-3 left-3 md:top-6 md:left-6 text-xl md:text-3xl  font-semibold text-white/90">
              The Bundle
            </div>
          }
          title={"The Bundle"}
          excerpt={"3D Illustrations and more"}
        />
      </motion.div>
    </section>
  );
}

function SectionD() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={<SectionHeaderBadge>Customize</SectionHeaderBadge>}
        title={
          <>
            Built for Hackers,
            <br />
            Built for Enterprise
          </>
        }
        excerpt={
          <>
            Grida is built to be hackable—designed for extensibility,
            customization, and performance from the ground up.
          </>
        }
      />
      <div className="my-16">
        <Content3 />
      </div>
      <DocumentCloudCard />
    </section>
  );
}

function DocumentCloudCard() {
  return (
    <div className=" flex flex-col border p-6 md:p-10 gap-12 rounded-xl mx-auto w-full md:w-3/4">
      <div className="flex justify-between items-start">
        <h6 className=" text-lg font-semibold">
          Document Cloud for Enterprise
        </h6>
        <Link href={sitemap.links.book30} target="_blank">
          <Button className="p-0 text-sm" variant="link">
            Contact us for more
          </Button>
        </Link>
      </div>
      <p className="text-sm opacity-50">
        Building something visual? Grida for Enterprise saves you months. <br />
        Get custom, on-premise solutions tailored to your needs.
      </p>
    </div>
  );
}
