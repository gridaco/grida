"use client";
import React, { useState } from "react";
import Image from "next/image";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Hero from "@/app/(www)/(home)/.home/hero";
import Content1 from "./.home/content-1";
import Content2 from "./.home/content-2";
import Content3 from "./.home/content-3";
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
      <Section container className="-mt-40">
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

      <SectionFooterContainer className="flex flex-col">
        <Section className="flex-1">
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
            className="absolute inset-0 bg-white/40 z-20 flex items-center justify-center cursor-pointer"
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
  button?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col container md:max-w-6xl max-w-lg items-center justify-center">
      <Badge
        variant="secondary"
        className="text-lg font-medium rounded-full bg-slate-100 text-slate-600"
      >
        {badge}
      </Badge>
      <div className="flex flex-col">
        <span className="text-5xl lg:text-6xl font-bold py-10 text-center max-w-3xl">
          {title}
        </span>
        <p className="max-w-xl mx-auto text-muted-foreground text-center">
          {excerpt}
        </p>
      </div>
      {button && (
        <Button variant="link" className="mt-20">
          {button}
          <ArrowRight className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

function SquareCard({
  // media,
  title,
  background,
  foreground,
  excerpt,
}: {
  background: React.ReactNode;
  foreground: React.ReactNode;
  // media: {
  //   src: string;
  //   alt?: string;
  //   width?: number;
  //   height?: number;
  // };
  title: string;
  excerpt: string;
}) {
  return (
    <div className="w-full flex flex-col gap-3 lg:gap-4 group">
      <div className="relative w-full aspect-square rounded shadow border overflow-hidden">
        <span className="absolute w-full h-full -z-10">{background}</span>
        <span className="absolute z-10">{foreground}</span>
      </div>
      <div className="flex flex-col">
        <p className="text-xl font-medium">{title}</p>
        <p className="text-sm text-muted-foreground">{excerpt}</p>
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
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="w-full mx-0 my-40"
        >
          <Content1 />
        </motion.div>
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
      />
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
        className="flex flex-col gap-5 lg:flex-row lg:gap-6 items-center justify-center mt-32"
      >
        <SquareCard
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
            <div className="relative top-6 left-6 text-3xl font-semibold text-white/90">
              Canvas
            </div>
          }
          title={"Canvas"}
          excerpt={"Design Components and Websites"}
        />
        <SquareCard
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
            <div className="relative top-6 left-6 text-3xl font-semibold text-white/90">
              Forms
            </div>
          }
          title={"Forms"}
          excerpt={"Get user responses, Launch MVP"}
        />
        <SquareCard
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
            <div className="relative top-6 left-6 text-3xl font-semibold text-white/90">
              Database
            </div>
          }
          title={"Database"}
          excerpt={"Manage data, create pipelines & endpoints"}
        />
        <SquareCard
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
            <div className="relative top-6 left-6 text-3xl font-semibold text-white/90">
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
        <Content2 />
      </div>
    </section>
  );
}

function SectionD() {
  return (
    <section className="my-60 relative">
      <SectionHeader
        badge={"Customize"}
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
      <div className=" flex flex-col border py-10 px-10 gap-12 rounded-xl mx-40">
        <div className="flex justify-between items-center">
          <h6 className=" text-lg font-semibold">
            Document Cloud for Enterprise
          </h6>
          <Button className="p-0 text-sm" variant="link">
            Contact us for more
          </Button>
        </div>
        <p className="text-sm opacity-50">
          Building something visual? Grida for Enterprise saves you months.{" "}
          <br />
          Get custom, on-premise solutions tailored to your needs.
        </p>
      </div>
    </section>
  );
}

function SectionFooterContainer({
  className,
  children,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full h-full min-h-screen rounded-t-3xl md:rounded-t-[50px] overflow-hidden border-t",
        className
      )}
    >
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <iframe
          loading="eager"
          className="w-full h-full"
          src="https://bg.grida.co/embed/shadergradient/88"
        />
        {/* gradient for footer visibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
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
          The Free & Open Canvas
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
