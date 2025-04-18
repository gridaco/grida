"use client";

import React from "react";
import { useState, useRef, useEffect } from "react";
import { motion, useInView } from "framer-motion";
import FooterWithCTA from "@/www/footer-with-cta";
import Image from "next/image";
import { ArrowRight, GiftIcon, Link2, Percent, Star } from "lucide-react";
import { sitemap } from "@/www/data/sitemap";
import Header from "@/www/header";
import { GridaLogo } from "@/components/grida-logo";
import Link from "next/link";
import { Button as FancyButton } from "@/www/ui/button";
import { Button } from "@/components/ui/button";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/utils";
import CustomDomainDemo from "./custom-domain-demo";
import { AnalysisIcon } from "@/www/icons";
import Hello from "./hello";

export default function WestPage() {
  return (
    <main>
      <Header />
      <HeroSection />
      <BrandsSection />
      <InteractiveCardDemo />
      <CustomDomainDemo />
      <FeaturesSection />
      <HowItWorksSection />
      <HorizontalScrollDemo />
      <WestCTA />
      <FooterWithCTA />
    </main>
  );
}

function HeroSection() {
  const [email, setEmail] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Email submitted:", email);
    setEmail("");
  };

  return (
    <section className="relative overflow-hidden py-40 md:py-60">
      <div className="absolute inset-0 -z-10 pointer-events-none dark:hidden">
        <iframe
          loading="eager"
          className="w-full h-full"
          src="https://bg.grida.co/embed/aurora"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>
      <div className="container relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <div className="grid gap-14 md:gap-20 xl:gap-80 lg:grid-cols-2 items-center">
            <div className="space-y-6">
              <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
                Saddle up for success
              </div>
              <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl flex flex-wrap items-center gap-2">
                Welcome to
                <span className="relative md:w-[190px] md:h-[70px] w-[160px] h-[40px]">
                  <Image
                    src="/west/logo-with-type.png"
                    alt="Wild West Logo"
                    fill
                    className="object-contain dark:invert"
                  />
                </span>
                of referral marketing
              </h1>
              <p className="text-lg text-muted-foreground">
                Create engaging referral campaigns, design interactive quests,
                and transform your marketing into an adventure your customers
                will love.
              </p>
              <Link href={sitemap.links.cta}>
                <FancyButton
                  effect="expandIcon"
                  className="flex gap-2 group mt-8"
                  icon={ArrowRight}
                  iconPlacement="right"
                >
                  <span>Start your project</span>
                </FancyButton>
              </Link>
            </div>
            <Hello />
          </div>
        </motion.div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent"></div>
    </section>
  );
}

function BrandsSection() {
  return (
    <section className="my-32 py-16 bg-muted/50">
      <div className="container">
        <div className="flex flex-col items-center justify-center gap-4">
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Powered by
          </h2>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {[
              // <PolestarTypeLogo key="polestar" />,
              <GridaLogo key="grida" />,
            ].map((brand, index) => (
              <div
                key={index}
                className="h-12 w-24 relative flex items-center justify-center"
              >
                {typeof brand === "string" ? (
                  <Image
                    src={brand}
                    alt="Brand Logo"
                    fill
                    className="object-contain"
                  />
                ) : (
                  brand
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
            Features
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Stake your claim in the referral frontier
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Everything you need to create, manage, and optimize your referral
            marketing campaigns.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <div className="grid gap-8 md:grid-cols-2">
            <FeatureCard
              icon={<Link2 />}
              title="Generate Referral Code & Invite"
              description="Try how users can generate their own referral link and share it with friends."
              imageSrc="/www/.west/generate-code.png"
            />
            <FeatureCard
              icon={<GiftIcon />}
              title="Reward Simulation"
              description="See how rewards are structured based on the number of referrals or onboarding status."
              imageSrc="/www/.west/reward-simulation.png"
            />
            <FeatureCard
              icon={<AnalysisIcon />}
              title="Real-time Analytics"
              description="Analyze referral and participation data instantly with visual graphs and metrics."
              imageSrc="/www/.west/real-time-analytics.png"
            />
            <FeatureCard
              icon={<Percent />}
              title="Track Onboarding Progress"
              description="Visualize which steps referred users have completed in the onboarding flow."
              imageSrc="/www/.west/track-onboarding.png"
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-muted/50 py-20">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
            How It Works
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Blaze your trail to referral success
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Get started with Grida WEST in just a few simple steps.
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
        >
          <div className="relative max-w-3xl h-[300px] sm:h-[450px] lg:h-[500px] mb-6  mx-auto transition-all">
            <Image
              src="/www/.west/how-it-work.png"
              alt="How it works demo"
              fill
              className="object-cover rounded-xl hover:scale-105 duration-500 ease-in-out transition-all"
            />
          </div>
        </motion.div>
        <div className="grid gap-8 md:grid-cols-3 items-stretch transition-all">
          {[
            {
              number: "01",
              title: "Create Your Campaign",
              description:
                "Design your referral campaign with our intuitive campaign builder. Set your goals, rewards, and tracking parameters.",
            },
            {
              number: "02",
              title: "Design Your Quests",
              description:
                "Create engaging quests that guide users through your product and incentivize specific actions.",
            },
            {
              number: "03",
              title: "Launch & Optimize",
              description:
                "Launch your campaign, monitor performance in real-time, and optimize based on data-driven insights.",
            },
          ].map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{
                delay: index * 0.2,
                duration: 0.6,
                ease: "easeOut",
              }}
              viewport={{ once: true }}
              className="flex h-full"
            >
              <StepCard {...step} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="py-20">
      <div className="container">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
            Testimonials
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Tales from the trail
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Hear from pioneers whove struck gold with Grida WEST.
          </p>
        </div>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          <TestimonialCard
            quote="Grida WEST transformed our referral program. We've seen a 300% increase in referrals since implementing their platform."
            author="Sarah Johnson"
            company="Marketing Director, TechStart"
          />
          <TestimonialCard
            quote="The gamification features have completely changed how our customers interact with our brand. Engagement is through the roof!"
            author="Michael Chen"
            company="CEO, Engage Solutions"
          />
          <TestimonialCard
            quote="Setting up quests for our onboarding process has reduced our churn rate by 40%. The ROI has been incredible."
            author="Jessica Williams"
            company="Product Manager, SaaS Innovators"
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  imageSrc,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  imageSrc?: string;
}) {
  return (
    <div className="rounded-lg border bg-card dark:bg-muted px-6 py-3 shadow-sm transition-all hover:bg-neutral-50 dark:hover:bg-white/10 group">
      <div className="flex flex-row items-end h-full gap-6">
        <div className="flex-1 self-end">
          <div className="mb-4 text-3xl opacity-50">{icon}</div>
          <h3 className="mb-2 text-xl font-bold">{title}</h3>
          <p className="text-muted-foreground mb-4 text-sm">{description}</p>
        </div>
        {imageSrc && (
          <div className="flex-shrink-0 w-[200px] h-[200px] lg:w-[300px] lg:h-[300px] relative hover:scale-105 duration-500 transition-all">
            <Image
              src={imageSrc}
              alt={`${title} image`}
              fill
              className="object-contain"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StepCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm group">
      <div className="mb-4 relative flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 dark:bg-neutral-300/10 text-xl font-bold transition-all duration-300 overflow-hidden">
        <span className="group-hover:opacity-0 group-hover:scale-90 transition-all duration-300 ease-in-out">
          {number}
        </span>
        <span
          className={cn(
            "absolute opacity-0 scale-90 transition-all duration-300 ease-in-out",
            "group-hover:opacity-100 group-hover:scale-100"
          )}
        >
          {number === "01"
            ? "🧩"
            : number === "02"
              ? "🎯"
              : number === "03"
                ? "🎉"
                : ""}
        </span>
      </div>
      <h3 className="mb-2 text-xl font-bold">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function TestimonialCard({
  quote,
  author,
  company,
}: {
  quote: string;
  author: string;
  company: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex mb-4 text-slate-600">
        <Star className="h-5 w-5 fill-current" />
        <Star className="h-5 w-5 fill-current" />
        <Star className="h-5 w-5 fill-current" />
        <Star className="h-5 w-5 fill-current" />
        <Star className="h-5 w-5 fill-current" />
      </div>
      <p className="mb-4 italic text-muted-foreground">&quot;{quote}&quot;</p>
      <div>
        <p className="font-semibold">{author}</p>
        <p className="text-sm text-muted-foreground">{company}</p>
      </div>
    </div>
  );
}

function InteractiveCardDemo() {
  const [activeCard, setActiveCard] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const cards = [
    {
      title: "Welcome Gift",
      description: "Start your journey with a special welcome bonus",
      icon: "🎁",
      reward: "1,000 Points",
      borderColor: "border-amber-300",
    },
    {
      title: "Share & Earn",
      description: "Invite friends to earn bonus rewards",
      icon: "💸",
      reward: "30,000 Points per referral",
      borderColor: "border-rose-300",
    },
    {
      title: "Complete Quest",
      description: "Finish your first marketing quest",
      icon: "✨",
      reward: "500 Points + Badge",
      borderColor: "border-emerald-300",
    },
  ];

  const handleNext = () => {
    setFlipped(false);

    setTimeout(() => {
      setActiveCard((prev) => (prev + 1) % cards.length);
    }, 300);
  };

  const handlePrevious = () => {
    setFlipped(false);
    setTimeout(() => {
      setActiveCard((prev) => (prev - 1 + cards.length) % cards.length);
    }, 300);
  };

  const handleFlip = () => {
    setFlipped(!flipped);
  };

  return (
    <section id="rewards" className="py-20">
      <div className="flex flex-col container items-center">
        <div className="mx-auto mb-16 max-w-2xl text-center">
          <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
            For Marketers
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Deliver interactive experiences that captivate your customers
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            With Grida WEST, you can turn forms, quests, and campaigns into
            playful, reward-driven experiences that spark engagement and make
            marketing fun for your audience.
          </p>
        </div>

        <div className="max-w-lg lg:max-w-6xl relative h-[500px] py-20 px-40 overflow-hidden flex items-end justify-center bg-muted/50 border border-muted rounded-lg transition-all">
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            viewport={{ once: true }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
          >
            <div className="relative w-[450px] h-[500px] rounded-3xl shadow-lg bg-white border border-mute overflow-hidden">
              <div className="absolute inset-0 -translate-y-1">
                {/* 기존 카드 슬라이더 컴포넌트 */}
                <div className="relative h-full w-full flex items-center justify-center perspective">
                  <div className="absolute inset-0 flex items-center justify-center">
                    {cards.map((card, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        animate={
                          index === activeCard
                            ? { opacity: 1, y: 0 }
                            : { opacity: 0, y: 20 }
                        }
                        transition={{ duration: 0.4, ease: "easeOut" }}
                        className={cn(
                          "absolute w-full max-w-xs",
                          index === activeCard
                            ? "z-20"
                            : index === (activeCard + 1) % cards.length
                              ? "z-10"
                              : "z-0"
                        )}
                      >
                        <div
                          className={cn(
                            "relative preserve-3d transition-all duration-500 w-full",
                            flipped && index === activeCard
                              ? "rotate-y-180"
                              : ""
                          )}
                        >
                          <Card
                            className={cn(
                              "backface-hidden border-2 bg-white text-black shadow-lg",
                              card.borderColor
                            )}
                          >
                            <CardHeader>
                              <CardTitle>Reward Revealed!</CardTitle>
                              <CardDescription>
                                Complete this action to claim your reward
                              </CardDescription>
                            </CardHeader>
                            <CardContent>
                              <motion.div
                                key={`${card.icon}-${activeCard}`}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{
                                  type: "spring",
                                  stiffness: 300,
                                  damping: 20,
                                }}
                                className="h-24 flex flex-col items-center justify-center gap-2"
                              >
                                <span className="text-4xl">{card.icon}</span>
                                <p className="text-xl font-bold">
                                  {card.reward}
                                </p>
                              </motion.div>
                            </CardContent>
                            <CardFooter className="flex justify-between">
                              <Button
                                variant="outline"
                                className="dark:text-white"
                                onClick={handlePrevious}
                              >
                                Go Back
                              </Button>
                              <Button
                                className="border-primary-foreground"
                                onClick={handleNext}
                              >
                                Next <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </CardFooter>
                          </Card>
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-2 mb-16">
                    {cards.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setFlipped(false);
                          setTimeout(() => setActiveCard(index), 300);
                        }}
                        className={cn(
                          "w-2 h-2 rounded-full transition-all",
                          index === activeCard
                            ? "bg-black w-6"
                            : "bg-muted dark:bg-muted/10"
                        )}
                        aria-label={`Go to card ${index + 1}`}
                      />
                    ))}
                  </div>
                  <div
                    className="absolute bottom-0  h-2 w-40
               bg-muted dark:bg-muted/10 items-center justify-center mb-4 rounded-full"
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function HorizontalCard({
  icon,
  title,
  description,
  imageSrc,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  imageSrc?: string;
}) {
  return (
    <div className="card flex-shrink-0 flex items-end gap-6">
      <div className="flex-1">
        <div className="text-3xl mb-2">{icon}</div>
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="max-w-xs text-muted-foreground break-words whitespace-normal">
          {description}
        </p>
      </div>
      {imageSrc && (
        <div className="h-[400px]">
          <Image
            src={imageSrc}
            alt={`${title} image`}
            width={400}
            height={400}
            className="object-contain h-full w-auto border border-muted rounded-2xl shadow-lg"
          />
        </div>
      )}
    </div>
  );
}

function HorizontalScrollDemo() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (!container) return;

      const atStart = container.scrollLeft === 0;
      const atEnd =
        Math.ceil(container.scrollLeft + container.clientWidth) >=
        container.scrollWidth;

      if (!atStart && !atEnd) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      } else if ((atStart && e.deltaY < 0) || (atEnd && e.deltaY > 0)) {
        return;
      } else {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, []);

  return (
    <section className="py-20">
      <div className="mx-auto mb-16 max-w-2xl text-center">
        <div className="inline-block rounded-full bg-indigo-100 px-3 py-1 text-sm text-indigo-800">
          Highlights
        </div>
        <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
          What makes us unique
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Explore the all-in-one referral platform designed to engage users and
          drive growth.
        </p>
      </div>

      <div className="relative bg-background overflow-hidden">
        <div>
          <div
            ref={containerRef}
            className="horizontal-scroll-container max-w-full overflow-x-auto whitespace-nowrap flex gap-20"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style jsx>{`
              .horizontal-scroll-container::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            <div className="snap-start flex-shrink-0  flex items-center justify-center pl-20 py-20">
              <HorizontalCard
                icon="📊"
                title="Campaign Analytics"
                description="Gain real-time insights into referral performance with detailed charts and customer data."
                imageSrc="/www/.west/demo-1.png"
              />
            </div>
            <div className="snap-start flex-shrink-0  flex items-center justify-center py-20">
              <HorizontalCard
                icon="💸"
                title="Interactive Campaign Rewards"
                description="Users can join live campaigns and earn various rewards through engaging invite-based interactions."
                imageSrc="/www/.west/demo-2.png"
              />
            </div>
            <div className="snap-start flex-shrink-0  flex items-center justify-center pr-20 py-20">
              <HorizontalCard
                icon="🗂️"
                title="Powerful Customer management"
                description="Manage your customers with precision — view activity, segment users with tags, and track engagement across campaigns in one place."
                imageSrc="/www/.west/demo-3.png"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function WestCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.0, ease: "easeOut" }}
    >
      <section className="flex justify-center py-12 mb-60 ">
        <div className="max-w-md md:max-w-2xl lg:max-w-4xl w-full bg-muted/50 rounded-xl border flex flex-col items-center text-center space-y-6 px-6 py-12 transition-all">
          <h2 className="text-2xl md:text-3xl font-bold">
            Elevate Your Referral Marketing
            <br /> with Grida West Enterprise
          </h2>

          <p className="text-foreground">
            The all-in-one referral platform designed to engage users and drive
            growth.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md items-center justify-center">
            <Link href={sitemap.links.signin}>
              <Button className="flex-1 group" size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Link href={sitemap.links.book30}>
              <Button
                variant="outline"
                className="flex-1 dark:bg-white/20 dark:hover:bg-white/30"
                size="lg"
              >
                Book a Meeting
              </Button>
            </Link>
          </div>

          <p className="text-sm text-neutral-400">
            Join 100+ enterprise companies already using Grida West
          </p>
        </div>
      </section>
    </motion.div>
  );
}
