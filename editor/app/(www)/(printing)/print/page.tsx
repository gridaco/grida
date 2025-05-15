"use client";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "motion/react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/www/ui/section";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/lib/utils";
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
import { wwwprint } from "./data";

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
      "Get a real preview of your design instantly! We print samples on the spot with the exact materials and finishes, ensuring quick approvals and confident decisions. 🚀",
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
          <MarqueeHero />
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
        <SectionExploreTemplates />
      </Section>
      <div>
        <Section container className="mt-80 overflow-visible">
          <SectionExploreMaterials />
        </Section>
        <div className="my-16">
          <MarqueeMaterials />
        </div>
      </div>
      <hr className="my-40" />
      <Section container>
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

const MarqueeCard = ({ image, name }: { image: string; name: string }) => {
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
        src={image}
        width={400}
        height={300}
        alt={name}
      />
    </figure>
  );
};

const row1 = wwwprint.categories.slice(0, wwwprint.categories.length / 2);
const row2 = wwwprint.categories.slice(wwwprint.categories.length / 2);

function MarqueeHero() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:30s]">
        {row1.map((item) => (
          <Link key={item.name} href={sitemap.print.links.templates}>
            <MarqueeCard {...item} />
          </Link>
        ))}
      </Marquee>
      <Marquee pauseOnHover reverse className="[--duration:40s]">
        {row2.map((item) => (
          <Link key={item.name} href={sitemap.print.links.templates}>
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

function SectionExploreTemplates() {
  return (
    <div>
      <SectionHeader
        oriantation="start"
        title={<>Explore Materials & Templates</>}
        excerpt={
          <>
            <Link href={sitemap.print.links.templates}>
              <Button className="rounded-full">
                Explore all Templates <ArrowRightIcon className="ms-2" />
              </Button>
            </Link>
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 my-16">
        {wwwprint.categories.slice(0, 6).map((category, index) => (
          <Link href={sitemap.print.links.templates} key={index}>
            <div className="flex flex-col items-start">
              <div className="relative w-full aspect-video rounded-lg shadow-lg overflow-hidden">
                <Image
                  src={category.image}
                  alt={category.name}
                  width={400}
                  height={300}
                  className="w-full h-full object-cover hover:scale-110 transform-gpu transition-all duration-300"
                />
              </div>
              <p className="mt-2 text-lg font-medium text-left">
                {category.name}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SectionExploreMaterials() {
  return (
    <div>
      <SectionHeader
        oriantation="start"
        title={<>The Right Paper for Every Design</>}
        excerpt={
          <>
            <Link href={sitemap.print.links.materials}>
              <Button className="rounded-full">
                Explore all Materials <ArrowRightIcon className="ms-2" />
              </Button>
            </Link>
          </>
        }
      />
    </div>
  );
}

function MarqueeMaterials() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:20s]">
        {wwwprint.materials.map((item) => (
          <Link key={item.name} href={sitemap.print.links.materials}>
            <MarqueeCard {...item} />
          </Link>
        ))}
      </Marquee>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-background"></div>
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-background"></div>
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
        {wwwprint.faqs.map((faq, index) => (
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

function SectionCustomOrder() {
  return (
    <Link href={sitemap.print.links.ordercustom}>
      <div
        className={cn(
          "group relative flex flex-col justify-between overflow-hidden rounded-xl w-4/5 mx-auto h-80 p-8"
        )}
      >
        <div className="z-10">
          <h6 className="text-4xl font-bold text-black">Request a Design</h6>
          <p className="text-sm opacity-50 text-black max-w-xl mt-4">
            From concept to final print, we bring your ideas to life. Whether
            you need a custom design or high-quality printing, we handle it all.
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
        <Button
          variant="outline"
          className="w-min border border-black bg-transparent rounded-full z-10"
        >
          Contact us for more
          <ArrowRight className="ml-2 size-4" />
        </Button>
        <div className="pointer-events-none absolute inset-0 transform-gpu transition-all duration-300 group-hover:dark:bg-neutral-800/10" />
      </div>
    </Link>
  );
}

const tabs: {
  name: string;
  description: string;
  items: {
    name: string;
    description: string;
    image: string;
  }[];
}[] = [
  {
    name: "Flyer",
    description:
      "Promote your business with these sleek and professional flyers.",
    items: [
      {
        name: "Business Promo Flyer",
        description:
          "A sleek and professional flyer perfect for promoting your business, services, or special offers.",
        image: "/www/.print/categories/01.png",
      },
      {
        name: "Event Invitation Flyer",
        description:
          "Ideal for parties, concerts, and corporate events, this flyer design grabs attention with bold visuals.",
        image: "/www/.print/categories/02.png",
      },
      {
        name: "Restaurant Menu Flyer",
        description:
          "A stylish, easy-to-read menu flyer for restaurants, cafés, and food trucks to showcase their best dishes.",
        image: "/www/.print/categories/03.png",
      },
      {
        name: "Real Estate Listing Flyer",
        description:
          "Designed for realtors to highlight property listings with stunning images and key details.",
        image: "/www/.print/categories/04.png",
      },
    ],
  },
  {
    name: "Cigar Bands",
    description:
      "Premium cigar bands designed to elevate your brand with custom logos, foil stamping, and intricate details.",
    items: [
      {
        name: "Classic Gold Foil Band",
        description:
          "A timeless cigar band with elegant gold foil accents for a luxurious touch.",
        image: "/www/.print/demo/cigar-band-1.png",
      },
      {
        name: "Vintage Style Band",
        description:
          "A retro-inspired design with intricate patterns, perfect for traditional cigar brands.",
        image: "/www/.print/demo/cigar-band-2.png",
      },
      {
        name: "Minimalist Modern Band",
        description:
          "A sleek, contemporary band with clean lines and subtle branding.",
        image: "/www/.print/demo/cigar-band-3.png",
      },
      {
        name: "Custom Embossed Band",
        description:
          "A high-end option featuring embossed textures and detailed custom artwork.",
        image: "/www/.print/demo/cigar-band-4.png",
      },
    ],
  },
  {
    name: "Packaging",
    description:
      "High-quality, custom packaging solutions designed to enhance product presentation and branding.",
    items: [
      {
        name: "Luxury Gift Box",
        description:
          "Premium rigid box with custom printing and high-end finishes.",
        image: "/www/.print/categories/02.png",
      },
      {
        name: "Branded Shipping Box",
        description:
          "Durable, eco-friendly corrugated boxes customized with your logo.",
        image: "/www/.print/categories/09.png",
      },
      {
        name: "Custom Paper Bag",
        description:
          "Elegant paper bags with handles, ideal for retail and boutiques.",
        image: "/www/.print/categories/12.png",
      },
      {
        name: "Stand-up Pouch",
        description:
          "Versatile and resealable pouch packaging for food, coffee, and more.",
        image: "/www/.print/categories/20.png",
      },
    ],
  },
  {
    name: "Posters",
    description:
      "Vibrant, high-quality posters perfect for advertising, décor, and events.",
    items: [
      {
        name: "Event Promotion Poster",
        description:
          "Eye-catching poster for concerts, festivals, and special events.",
        image: "/www/.print/categories/03.png",
      },
      {
        name: "Retail Advertising Poster",
        description:
          "Bold and engaging poster design for in-store promotions and sales.",
        image: "/www/.print/categories/07.png",
      },
      {
        name: "Movie & Entertainment Poster",
        description:
          "High-resolution posters featuring cinematic or artistic visuals.",
        image: "/www/.print/categories/18.png",
      },
      {
        name: "Office & Wall Art Poster",
        description:
          "Premium-quality posters designed for home and office décor.",
        image: "/www/.print/categories/16.png",
      },
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
        badge={<Badge>Templates</Badge>}
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
          <div className="col-span-2 w-full h-[300px] md:h-[450px] lg:h-[650px]">
            <Link href={sitemap.print.links.templates}>
              <PromotedTemplateCard
                name={data.items[0].name}
                description={data.items[0].description}
                image={data.items[0].image}
                width={1320}
                height={792}
              />
            </Link>
          </div>

          <div className="grid grid-rows-3 gap-3 w-full h-[300px] md:h-[450px] lg:h-[650px]">
            {data.items.slice(1).map(({ name, description, image }, i) => (
              <Link href={sitemap.print.links.templates} key={i}>
                <PromotedTemplateCard
                  name={name}
                  description={description}
                  image={image}
                  width={400}
                  height={300}
                />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PromotedTemplateCard({
  name,
  image,
  description,
  width,
  height,
  className,
}: {
  name: string;
  description: string;
  image: string;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "group relative w-full h-full overflow-hidden rounded-sm md:rounded-lg",
        className
      )}
    >
      <div className="absolute inset-0 pointer-events-none">
        <Image
          src={image}
          alt={name}
          width={width}
          height={height}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 ease-in-out"
        />
      </div>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <div className="absolute bottom-0 left-0 z-10 grid gap-2 p-4 ">
          <h2 className="text-lg font-bold">{name}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {description}
          </p>
        </div>
        <div className="pointer-events-none absolute inset-x-0 h-full bottom-0 w-full bg-gradient-to-t from-background" />
      </div>
    </Card>
  );
}
