"use client";
import React, { useState } from "react";
import Image from "next/image";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Hero from "@/app/(www)/(home)/.home/hero";
import { Demo1 } from "./.home/demo-1";
import { Demo2 } from "./.home/demo-2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";

export default function WWW() {
  return (
    <main className="container mx-auto">
      <Header />
      <Hero />
      <SectionMainDemo />
      <SectionA />
      <SectionB />
      <SectionC />
      <SectionCTA />
      <Footer />
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
      <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-video overflow-hidden relative">
        {/* Overlay for lock */}
        {isLocked && (
          <div
            className="absolute inset-0 bg-black/20 z-20 flex items-center justify-center cursor-pointer"
            onClick={unlockDemo}
          >
            <Button>Click to play</Button>
          </div>
        )}
        <div
          data-locked={isLocked}
          className="w-full h-full pointer-events-none data-[locked='false']:pointer-events-auto"
        >
          <iframe src="https://app.grida.co/canvas" className="w-full h-full" />
        </div>
      </Card>
    </motion.div>
  );
}

function SectionHeader({
  badge,
  title,
  excerpt,
  button,
}: {
  badge: string;
  title: string;
  excerpt: string;
  button: string;
}) {
  return (
    <div className="flex flex-col container md:max-w-6xl max-w-lg items-center justify-center">
      <Badge
        variant="secondary"
        className="text-lg font-medium rounded-full bg-slate-100 text-slate-600"
      >
        {badge}
      </Badge>
      <div className="flex flex-col gap-5">
        <span className="text-5xl lg:text-6xl font-bold py-10 text-center">
          {title}
        </span>
        <p className="max-w-xl mx-auto text-lg text-muted-foreground text-center">
          {excerpt}
        </p>
      </div>
      <Button variant="link" className="text-lg mt-20">
        {button}
        <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function MediaCard({
  media,
  title,
  excerpt,
}: {
  media: {
    src: string;
    alt?: string;
    width?: number;
    height?: number;
  };
  title: string;
  excerpt: string;
}) {
  return (
    <div className="flex flex-col gap-3 lg:gap-4 group">
      <div className="overflow-hidden rounded-lg shadow-lg border border-slate-200">
        <Image
          src={media.src}
          alt={media.alt ?? "Media content"}
          width={media.width || 1000}
          height={media.height || 1000}
          className="object-cover w-full transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
      <div className="flex flex-col">
        <p className="text-lg font-medium">{title}</p>
        <p className="font-normal opacity-80">{excerpt}</p>
      </div>
    </div>
  );
}

function SectionA() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={"Canvas"}
        title={"Design editor tool with customizable templates."}
        excerpt={
          "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
        }
        button={"Open your Canvas"}
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
        <Demo1 />
      </div>
    </section>
  );
}

function SectionB() {
  return (
    <section className="my-60">
      <SectionHeader
        badge={"CMS"}
        title={"This is CMS."}
        excerpt={
          "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
        }
        button={"Start CMS"}
      />
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        className="flex flex-col gap-5 lg:flex-row lg:gap-10 items-center justify-center mt-32"
      >
        <MediaCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Title"}
          excerpt={"excerpt"}
        />
        <MediaCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Title"}
          excerpt={"excerpt"}
        />
        <MediaCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Title"}
          excerpt={"excerpt"}
        />
        <MediaCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Title"}
          excerpt={"excerpt"}
        />
      </motion.div>
    </section>
  );
}

function SectionC() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={"Forms"}
        title={"Design editor tool with customizable templates."}
        excerpt={
          "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
        }
        button={"Open your Canvas"}
      />
      <div className="">
        {/* <div className="absolute inset-0 -z-10 flex justify-center items-center">
        <svg
          width="1400px"
          height="1400px"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient
              id="horizontalGradient"
              x1="0%"
              y1="100%"
              x2="0%"
              y2="0%"
            >
              <stop offset="0%" stopColor="rgba(166, 152, 255, 0.9)" />
              <stop offset="100%" stopColor="rgba(250, 255, 229, 0)" />
            </linearGradient>
          </defs>
          <rect
            width="1400"
            height="1400"
            fill="url(horizontalGradient)"
          />
        </svg>
      </div> */}

        <Demo2 />
      </div>
    </section>
  );
}

function SectionCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      whileInView={{ opacity: 1, y: 50 }}
      transition={{ duration: 1.5, ease: "easeOut" }}
      className="container mx-xl flex flex-col-reverse gap-16 md:flex md:flex-row justify-between mt-80 mb-60"
    >
      <div className="flex flex-col">
        <p className="text-left text-5xl lg:text-6xl font-semibold">
          Design editor tool with customizable templates.
        </p>
        <div className="flex gap-4 mt-20">
          <Button className="flex gap-2 group">
            <span>Start your project</span>
            <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
          </Button>
          <Button variant="outline">Try the demo</Button>
        </div>
      </div>
      <Image
        src={"/affiliate/poc/images/db-illust.png"}
        alt="illust"
        width={900}
        height={900}
        className="max-h-[300px] max-w-[300px] lg:max-h-[500px] lg:max-w-[500px]"
      />
    </motion.div>
  );
}
