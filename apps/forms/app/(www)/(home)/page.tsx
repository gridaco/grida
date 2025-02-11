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
import { Pixelify_Sans } from "next/font/google";

const pixelify = Pixelify_Sans({ subsets: ["latin"] });

export default function WWW() {
  return (
    <main>
      <Header />
      <Section container>
        <Hero />
      </Section>
      <Section container className="mt-40">
        <SectionMainDemo />
      </Section>
      <Section container className="mt-40">
        <SectionA />
      </Section>
      <Section container className="mt-40">
        <SectionB />
      </Section>
      <Section container className="mt-40">
        <SectionC />
      </Section>
      <SectionFooterContainer>
        <Section>
          <SectionCTA />
        </Section>
        <Footer />
      </SectionFooterContainer>
    </main>
  );
}

function Section({
  children,
  className,
  container,
  ...props
}: React.HtmlHTMLAttributes<HTMLDivElement> & {
  container?: boolean;
}) {
  return (
    <div
      {...props}
      className={cn(container ? "container mx-auto" : "", className)}
    >
      {children}
    </div>
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
      <Card className="mx-auto max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative">
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
          <iframe src="/canvas" className="w-full h-full" />
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
  badge: React.ReactNode;
  title: React.ReactNode;
  excerpt: React.ReactNode;
  button: React.ReactNode;
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

function SquareCard({
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
      <div className="aspect-square rounded shadow border overflow-hidden">
        <Image
          src={media.src}
          alt={media.alt ?? "Media content"}
          width={media.width || 1000}
          height={media.height || 1000}
          className="object-cover w-full h-full transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
      <div className="flex flex-col">
        <p className="text-lg font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{excerpt}</p>
      </div>
    </div>
  );
}

function SectionA() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={"Canvas"}
        title={
          <>
            <span>From websites to</span>{" "}
            <span
              className={cn(
                "border border-foreground px-4",
                pixelify.className
              )}
            >
              Pixel arts
            </span>
          </>
        }
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
        badge={<>Explore</>}
        title={<>Right tools for the right job</>}
        excerpt={<>Explore all features & products.</>}
        button={"Start CMS"}
      />
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        className="flex flex-col gap-5 lg:flex-row lg:gap-10 items-center justify-center mt-32"
      >
        <SquareCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Canvas"}
          excerpt={"Design Components and Websites"}
        />
        <SquareCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Forms"}
          excerpt={"Get user responses, Launch MVP"}
        />
        <SquareCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"Database"}
          excerpt={"Manage data, create pipelines & endpoints"}
        />
        <SquareCard
          media={{
            src: "/assets/placeholder-image.png",
            alt: "card",
            width: 1000,
            height: 800,
          }}
          title={"The Bundle"}
          excerpt={"3D Illustrations and more."}
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

function SectionFooterContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full h-full min-h-screen rounded-t-3xl md:rounded-t-[50px] overflow-hidden border-t">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <iframe
          loading="eager"
          className="w-full h-full"
          src="https://bg.grida.co/embed/shadergradient/88"
        />
      </div>
      {children}
    </div>
  );
}

function SectionCTA() {
  return (
    <div className="container py-40 z-10">
      <div className="flex flex-col">
        <h2 className="text-left text-5xl lg:text-6xl font-semibold">
          The Free & Open source Canvas
        </h2>
        <div className="flex gap-4 mt-20">
          <Button className="flex gap-2 group">
            <span>Start your project</span>
            <ArrowRight className="h-5 w-5 hidden group-hover:inline-block transition-all duration-500"></ArrowRight>
          </Button>
          <Button variant="outline">Try the demo</Button>
        </div>
      </div>
    </div>
  );
}
