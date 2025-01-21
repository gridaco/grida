"use client";
import React from "react";
import Image from "next/image";
import { GridaLogo } from "@/components/grida-logo";
import Header from "@/app/(www-2025)/header";
import Hero from "@/app/(www-2025)/hero";
import { Demo1 } from "@/app/(www-2025)/demo-1";
import { IconRight } from "react-day-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import clsx from "clsx";
import * as k from "@/app/(www-2025)/data";
import bentomainbg from "@/app/(www-2025)/bento-fullsize-video-card-background.png";
import { cn } from "@/utils";

export default function WWW() {
  return (
    <main>
      <Header></Header>
      <Hero></Hero>
      <section>
        <div className="my-60">
          <FeatureSection
            badge={"Canvas"}
            title={"Design editor tool with customizable templates."}
            excerpt={
              "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
            }
            button={"Open your Canvas"}
          />
          <Demo1 />
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
          <div className="flex gap-10 items-center justify-center mt-32">
            <FeatureCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <FeatureCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <FeatureCard
              media={{
                src: "/assets/placeholder-image.png",
                alt: "card",
                width: 1000,
                height: 800,
              }}
              title={"Title"}
              excerpt={"excerpt"}
            />
            <FeatureCard
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
        <div>
          <FeatureSection
            badge={"Forms"}
            title={"Design editor tool with customizable templates."}
            excerpt={
              "Grida Canvas offers a versatile editor tool for designing any page with customizable templates and components, featuring AI-powered prompts, seamless file export, and integration with Figma for importing and exporting designs."
            }
            button={"Open your Canvas"}
          />
          <div>
            <Tabs
              className="flex flex-col items-center justify-center mt-10 gap-10"
              defaultValue={k.demo_2_categories[0]}
            >
              <TabsList className="flex flex-wrap h-9 bg-transparent items-center content-center gap-3 justify-center p-1 text-muted-foreground">
                {k.demo_2_categories.map((category) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="inline-flex items-center justify-center whitespace-nowrap rounded-full border px-4 py-1 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-black/90 data-[state=active]:text-white data-[state=active]:dark:invert"
                  >
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
              {k.demo_2_categories.map((category) => (
                <TabsContent key={category} value={category}>
                  <div className="container flex flex-col gap-5 px-8">
                    <div className="relative rounded-xl shadow-lg overflow-hidden border">
                      <div className="absolute top-10 left-10 md:top-20 md:left-20">
                        <span className="flex flex-col gap-1">
                          {k.imagesDemo2[category].main.text.map((t, i) => {
                            const islast =
                              i ===
                              k.imagesDemo2[category].main.text.length - 1;
                            return (
                              <BentoCardKeyword
                                key={i}
                                className="text-4xl md:text-7xl font-black"
                                steps={
                                  islast
                                    ? k.imagesDemo2[category].main
                                        .highlightColorStops
                                    : undefined
                                }
                              >
                                {t}
                              </BentoCardKeyword>
                            );
                          })}
                        </span>
                      </div>
                      <Image
                        priority
                        className=" md:h-[776px] w-full object-cover"
                        src={k.imagesDemo2[category].main.artwork}
                        alt={`${category}-main`}
                        width={1400}
                        height={776}
                      />
                      <Image
                        priority
                        className="absolute inset-0 w-full h-full object-cover -z-10"
                        src={bentomainbg}
                        alt={`${category}-main`}
                        width={1400}
                        height={776}
                      />
                      {/* bento-fullsize-video-card-background.png */}
                    </div>

                    <div className="flex flex-col lg:grid lg:grid-cols-4 gap-5">
                      {k.imagesDemo2[category].subs.map((sub, i) => {
                        return (
                          <BentoCard
                            key={i}
                            artwork={sub.artwork}
                            alt={`${category}-sub2`}
                            text1={sub.title}
                            text2={sub.description}
                            className={clsx(
                              "relative rounded-xl shadow-lg w-full border overflow-hidden",
                              "md:h-[320px]",
                              i === 0 ? "lg:col-start-1 lg:col-span-2" : ""
                            )}
                          />
                        );
                      })}
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>
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
    <div className="flex flex-col gap-3 container mx-auto items-center justify-center">
      <Badge className="text-base font-normal rounded-full">{badge}</Badge>
      <div className="flex flex-col gap-5">
        <span className="text-6xl font-bold py-10 text-center">{title}</span>
        <p className="font-normal opacity-80 text-center">{excerpt}</p>
      </div>
      <Button variant="link" className="text-base mt-20">
        {button}
        <ArrowRight className="h-5 w-5" />
      </Button>
    </div>
  );
}

function FeatureCard({
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
    <div className="flex flex-col gap-4 group">
      <div className="overflow-hidden rounded-lg shadow-lg border border-slate-200">
        <Image
          src={media.src}
          alt={media.alt ?? "Media content"}
          width={media.width || 1000}
          height={media.height || 1000}
          className="object-cover w-full transition-transform duration-300 ease-in-out group-hover:scale-110"
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-lg font-medium">{title}</p>
        <p className="font-normal opacity-80">{excerpt}</p>
      </div>
    </div>
  );
}

function BentoCardKeyword({
  className,
  steps,
  children,
}: React.PropsWithChildren<{
  className?: string;
  steps?: [string, string, string];
}>) {
  //
  const gradientClasses = steps
    ? `text-transparent bg-gradient-to-r ${steps.join(" ")} bg-clip-text`
    : "";

  return (
    <span>
      <h1 className={cn(gradientClasses, "inline-block", className)}>
        {children}
      </h1>
    </span>
  );
}

function BentoCard({
  artwork,
  alt,
  text1,
  text2,
  className,
}: {
  artwork: string;
  alt: string;
  text1: string;
  text2: string;
  className?: string;
}) {
  return (
    // md:h-[340px] w-full md:col-start-1 md:col-span-2
    <div className={className}>
      <div className="flex flex-col gap-3 p-8">
        <h6 className=" text-xl md:text-4xl font-bold">{text1}</h6>
        <span className="max-w-sm text-sm text-muted-foreground">{text2}</span>
      </div>
      <Image
        className=" hidden md:block absolute right-0 top-0 bottom-0 overflow-hidden object-right-bottom object-cover w-auto h-full -z-10"
        src={artwork}
        alt={alt}
        width={500}
        height={500}
      />
    </div>
  );
}
