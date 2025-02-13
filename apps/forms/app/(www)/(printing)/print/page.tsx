"use client";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/www/ui/section";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { Marquee } from "@/www/ui/marquee";
import { ArrowRightIcon, CalendarIcon } from "@radix-ui/react-icons";
import {
  BentoGrid,
  BentoCard,
  BentoCardContent,
  BentoCardCTA,
} from "@/www/ui/bento-grid";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import Image from "next/image";
import Footer from "@/www/footer";
import * as k from "./data";

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

const features = [
  {
    name: "7-Day A-Z Guarantee",
    description:
      "Every order—from samples to full production—is delivered within 14 days, ensuring both speed and reliability for your business.",
    className: "col-span-full md:col-span-2",
    cta: { label: "test", href: "/" },
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.print/features/01.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "3-Day Express Shipping",
    description:
      "Choose our express shipping option to receive your prints in just 3 days, keeping your projects on track and on time.",
    className: "col-span-full md:col-span-2",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.print/features/02.png"
          alt=""
          width={800}
          height={400}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Instant Sample Orders",
    description:
      "Order samples instantly with our high-performance system powered by Rust and WebGPU, ensuring quick turnaround and exceptional quality.",
    className: "col-span-full md:col-span-2",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.print/features/03.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Free Design Canvas",
    description:
      "Access our intuitive, no-cost design canvas to effortlessly create and customize print-ready layouts tailored to your needs.",
    className: "col-span-full md:col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.print/features/04.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
  {
    name: "Personalized 1:1 Management",
    description:
      "Enjoy dedicated, one-on-one order management that keeps your project on track and accelerates delivery for maximum efficiency.",
    className: "col-span-full md:col-span-1",
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.print/features/05.png"
          alt=""
          width={500}
          height={500}
          className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110 dark:invert"
        />
      </div>
    ),
  },
];

export default function WWWPrintingHome() {
  return (
    <main className="overflow-x-hidden w-full">
      <div className="min-h-screen relative w-full flex flex-col">
        <div className="w-full flex flex-col gap-12 mt-20">
          <Section container>
            <Hero />
          </Section>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          viewport={{ once: true }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 1.0, ease: "easeOut" }}
          className="absolute left-0 right-0 bottom-10 w-full overflow-hidden"
        >
          <MarqueeDemo />
        </motion.div>
        {/* <div className="absolute right-0 top-0 w-1/2 h-full -z-10">
            <Globe />
          </div> */}
      </div>
      <Section container className="mt-80">
        <SectionMainDemo />
      </Section>
      <Section container className="mt-80">
        <SectionFeatures />
      </Section>
      <Section container className="mt-80">
        <SectionExplore />
      </Section>
      <Section container className="mt-80">
        <SectionCustomOrder />
      </Section>
      <hr className="my-40" />
      <Section container>
        <SectionFAQ />
      </Section>
      <div className="h-96" />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative flex flex-col min-h-96 items-start justify-center overflow-visible z-10">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      >
        <div className="flex flex-col items-start text-left">
          <Badge variant="outline" className="mb-4">
            🇳🇮 Available in Nicaragua
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8 max-w-2xl">
            From Design to Print, in Just 7 Days
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground text-left">
            Fast, hassle-free printing for businesses in Nicaragua. Produced in
            South Korea, delivered in just 7 days—faster than US or Canada-based
            services.
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
    />
  );
}

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

const row1 = marqueeitems.slice(0, marqueeitems.length / 2);
const row2 = marqueeitems.slice(marqueeitems.length / 2);

function MarqueeDemo() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:20s]">
        {row1.map((item) => (
          <Link key={item.name} href="/print/~/templates">
            <MarqueeCard {...item} />
          </Link>
        ))}
      </Marquee>
      <Marquee pauseOnHover reverse className="[--duration:20s]">
        {row2.map((item) => (
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

function SectionFeatures() {
  return (
    <div>
      <SectionHeader
        oriantation="start"
        badge={<Badge>Why</Badge>}
        title={<>We’re the fastest</>}
        excerpt={
          <>
            We print faster and more precisely than any competitor. Even with
            international shipping, our production in South Korea ensures
            unmatched quality and speed—faster than US or Canada-based services.
          </>
        }
      />
      <BentoGrid className="grid-cols-4 my-16">
        {features.map((feature, idx) => (
          <BentoCard key={idx} {...feature} backgroundOrder={1}>
            <BentoCardContent
              {...feature}
              className="group-hover:-translate-y-0"
            />
          </BentoCard>
        ))}
      </BentoGrid>
    </div>
  );
}

function SectionExplore() {
  return (
    <div>
      <SectionHeader
        oriantation="start"
        badge={<Badge>Explore</Badge>}
        title={<>Explore Materials & Templates</>}
        excerpt={<>Explore all features & products.</>}
      />
      <div className="grid gap-4 my-16">
        <label>
          <span className="text-sm font-medium">Categories</span>
        </label>
        <div className="flex items-center gap-4 overflow-x-scroll">
          {k.categories.map((category) => (
            <CategoryCard key={category.id} {...category} />
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionFAQ() {
  return (
    <section className="w-full">
      <SectionHeader
        badge={<Badge>FAQ</Badge>}
        title={<>Frequently Asked Questions</>}
      />
      <Accordion
        type="single"
        collapsible
        className="w-full max-w-3xl mx-auto my-16"
      >
        {k.faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent>{faq.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function CategoryCard({ name, image }: { name: string; image: string }) {
  return (
    <div className="flex flex-col">
      <div className="relative h-20 aspect-video rounded-lg overflow-hidden">
        <Image
          src={image || "/placeholder.svg"}
          alt={name}
          layout="fill"
          objectFit="cover"
        />
      </div>
      <div className="w-full text-ellipsis">
        <p className="mt-2 w-full text-xs font-medium">{name}</p>
      </div>
    </div>
  );
}

function SectionCustomOrder() {
  return (
    <div
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-xl w-4/5 mx-auto h-80 p-8"
      )}
    >
      <div className="z-10">
        <h6 className="text-4xl font-bold text-black">Request a Design</h6>
        <p className="text-sm opacity-50 text-black max-w-xl mt-4">
          From concept to final print, we bring your ideas to life. Whether you
          need a custom design or high-quality printing, we handle it all.
        </p>
      </div>
      <div>
        <div className="absolute inset-0 bg-background">
          <Image
            src="/www/common/custom-card-bg-01.png"
            alt=""
            width={1200}
            height={520}
            className="w-full h-full object-cover object-right-bottom transition-transform duration-300 ease-in-out group-hover:scale-110"
          />
        </div>
      </div>
      <Link href={sitemap.print.links.ordercustom} className="z-10">
        <Button
          variant="outline"
          className="border border-black bg-transparent rounded-full"
        >
          Contact us for more
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </Link>
      <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:dark:bg-neutral-800/10" />
    </div>
  );
}

const tabs: { name: string; images: string[] }[] = [
  {
    name: "Cigar Band",
    images: [
      "/www/.print/demo/cigar-band-1.png",
      "/www/.print/demo/cigar-band-2.png",
      "/www/.print/demo/cigar-band-3.png",
      "/www/.print/demo/cigar-band-4.png",
    ],
  },
  {
    name: "Cigar Tube",
    images: [
      "/www/.print/cigar-band-1.png",
      "/www/.print/cigar-band-2.png",
      "/www/.print/cigar-band-3.png",
      "/www/.print/cigar-band-4.png",
    ],
  },
  {
    name: "Cigar Box",
    images: [
      "/www/.print/cigar-band-1.png",
      "/www/.print/cigar-band-2.png",
      "/www/.print/cigar-band-3.png",
      "/www/.print/cigar-band-4.png",
    ],
  },
  {
    name: "Cigar Sleeve",
    images: [
      "/www/.print/cigar-band-1.png",
      "/www/.print/cigar-band-2.png",
      "/www/.print/cigar-band-3.png",
      "/www/.print/cigar-band-4.png",
    ],
  },
];

function SectionMainDemo() {
  const [index, setIndex] = useState<number>(0);
  const data = tabs[index];

  return (
    <div>
      <SectionHeader
        oriantation="start"
        badge={<Badge>Start</Badge>}
        title={<>Start from here</>}
        excerpt={
          <>
            We print faster and more precisely than any competitor. Even with
            international shipping, our production in South Korea ensures
            unmatched quality and speed—faster than US or Canada-based services.
          </>
        }
      />

      <div className="flex flex-col items-start gap-8 my-12">
        <Tabs
          value={index + ""}
          onValueChange={(s) => setIndex(parseInt(s))}
          className="w-fit mt-4"
        >
          <TabsList>
            {tabs.map(({ name }, i) => (
              <TabsTrigger key={i} value={i + ""}>
                {name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-3 gap-4 w-full">
          <Card className="relative col-span-2 w-full h-[300px] md:h-[450px] lg:h-[650px] overflow-hidden rounded md:rounded-lg">
            <Image
              src={data.images[0]}
              alt={`${data.name} Main`}
              width={1320}
              height={792}
              className="w-full h-full object-cover"
            />
          </Card>

          <div className="grid grid-rows-3 gap-3 w-full h-[300px] md:h-[450px] lg:h-[650px]">
            {data.images.slice(1).map((src, i) => (
              <Card
                key={i}
                className="relative w-full h-full overflow-hidden rounded md:rounded-lg"
              >
                <Image
                  src={src}
                  alt={`${data.name} ${i + 1}`}
                  width={400}
                  height={300}
                  className="w-full h-full object-cover"
                />
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
