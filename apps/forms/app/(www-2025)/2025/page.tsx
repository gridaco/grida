"use client";
import React from "react";
import Image from "next/image";
import Header from "@/app/(www-2025)/header";
import Hero from "@/app/(www-2025)/hero";
import { Demo1 } from "@/app/(www-2025)/demo-1";
import { Demo2 } from "@/app/(www-2025)/demo-2";
import Footer from "@/app/(www-2025)/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

function Demo() {
  return (
    <motion.div
      className="hidden md:block z-10 -mt-40 mb-32"
      initial={{ opacity: 1, y: 100, scale: 1 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: 0.2,
        duration: 0.3,
        type: "spring",
        damping: 20,
      }}
    >
      <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-video overflow-hidden">
        <iframe src="/canvas" className="w-full h-full" />
      </Card>
    </motion.div>
  );
}

export default function WWW() {
  return (
    <main>
      <Header></Header>
      <Hero></Hero>
      <section>
        <div className="my-40">
          <Demo />
        </div>
        <div className="my-60 relative">
          <FeatureSection
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
                width="1400px"
                height="1400px"
                xmlns="http://www.w3.org/2000/svg"
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
        </div>
        <div className="my-60">
          <FeatureSection
            badge={"CMS"}
            title={"This is CMS."}
            excerpt={
              "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
            }
            button={"Start CMS"}
          />
          <div className="flex flex-col gap-5 lg:flex-row lg:gap-10 items-center justify-center mt-32">
            <CmsCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <CmsCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <CmsCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <CmsCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
          </div>
        </div>
        <div className="my-60 relative">
          <FeatureSection
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
        </div>
        <CtaSection />
        <Footer />
      </section>
    </main>
  );
}

function FeatureSection({
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
    <div className="flex flex-col container mx-auto items-center justify-center">
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
        <p className=" text-lg opacity-80 text-center">{excerpt}</p>
      </div>
      <Button variant="link" className="text-lg mt-20">
        {button}
        <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function CmsCard({
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

function CtaSection() {
  return (
    <div className="container mx-xl flex flex-col-reverse gap-16 md:flex md:flex-row justify-between mt-80 mb-60">
      <div className="flex flex-col">
        <p className="text-left text-5xl lg:text-6xl font-semibold">
          Design editor tool with customizable templates.
        </p>
        <div className="flex gap-4 mt-20">
          <Button className="px-8 py-6 border-2 border-black flex gap-2 group">
            <p className="text-lg font-normal">Start your project</p>
            <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
          </Button>
          <Button variant="outline" className="px-8 py-6 border-2 border-black">
            <p className="text-lg font-normal">Try to demo</p>
          </Button>
        </div>
      </div>
      <Image
        src={"/affiliate/poc/images/db-illust.png"}
        alt="illust"
        width={900}
        height={900}
        className="max-h-[300px] max-w-[300px] lg:max-h-[500px] lg:max-w-[500px]"
      />
    </div>
  );
}
