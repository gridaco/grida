"use client";
import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button as FancyButton } from "@/www/ui/button";
import { motion } from "framer-motion";
import Link from "next/link";
import { sitemap } from "@/www/data/sitemap";
import { ArrowRight } from "lucide-react";
import { Section, SectionHeader } from "@/www/ui/section";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { Marquee } from "@/www/ui/marquee";
import { CalendarIcon } from "@radix-ui/react-icons";
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

const faqs = [
  {
    question: "What products can I print with your service?",
    answer:
      "We offer high-quality printing for business cards, brochures, flyers, posters, labels, and more. Our printing services are tailored for business owners, including cigar brands in Nicaragua, looking for fast and precise printing. Visit our catalog to see all available products.",
  },
  {
    question: "How fast can I receive my printed products?",
    answer:
      "We offer express shipping from South Korea, which is often faster than using US or Canada-based printers. Our estimated delivery times are:\n\n- Express: 5-7 business days (including printing and shipping time)\n- Standard: 10-14 business days\n\nDelivery times may vary based on customs clearance and local logistics.",
  },
  {
    question: "Why do you print in South Korea?",
    answer:
      "South Korea offers the fastest and most accurate printing technology, ensuring superior quality and precision. Even with international shipping, our service is often **faster than US or Canada-based printing services**, making it the best option for businesses in Nicaragua.",
  },
  {
    question: "How much does shipping cost?",
    answer:
      "We offer competitive shipping rates based on the order size and urgency:\n\n- Express Shipping: Calculated at checkout based on your location\n- Standard Shipping: Free for bulk orders\n\nAll shipping includes tracking so you can monitor your order’s progress.",
  },
  {
    question: "Can I pick up my order locally in Nicaragua?",
    answer:
      "Currently, we do not offer local pickup in Nicaragua, as all orders are shipped directly from South Korea. However, our express shipping ensures that you receive your products faster than most local or North American printing services.",
  },
  {
    question:
      "What file specifications should I follow for the best print quality?",
    answer:
      "For the highest print quality, please ensure your files meet these requirements:\n\n- Minimum resolution: **300 DPI**\n- File formats: **PDF, PNG, JPG, or AI**\n- Color mode: **CMYK**\n- Bleed area: **3mm (0.125 inches) on all sides**\n\nWe also offer automated proofing to check your design for any issues before printing.",
  },
  {
    question: "What if there’s an issue with my order?",
    answer:
      "We stand by our **quality guarantee**. If there is any defect in your printed product, please contact our support team within **7 days of receiving your order**, and we will reprint or refund your order as needed. Our goal is 100% customer satisfaction.",
  },
  {
    question: "Do you offer custom printing for cigar brands in Nicaragua?",
    answer:
      "Yes! We specialize in **custom printing for cigar brands**, offering premium packaging, labels, and promotional materials. Our precise printing ensures that your brand stands out with high-quality finishes.",
  },
  {
    question: "How do I place an order?",
    answer:
      "Ordering is simple:\n\n1. Choose a product and upload your design.\n2. Select your preferred material and quantity.\n3. Review your order and confirm shipping details.\n4. Make a payment, and we’ll handle the rest!\n\nYour order will be printed in South Korea and shipped to Nicaragua with tracking.",
  },
];

const features = [
  {
    name: "14-Day A-Z Guarantee",
    description:
      "Every order—from samples to full production—is delivered within 14 days, ensuring both speed and reliability for your business.",
    className: "col-span-full md:col-span-2",
    cta: { label: "test", href: "/" },
    background: (
      <div className="absolute inset-0">
        <Image
          src="/www/.home/3/react-components.png"
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
          src="/www/.home/3/modular-sdk.png"
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
          src="/www/.home/3/optimized.png"
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
          src="/www/.home/3/widgets-templates.png"
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
          src="/www/.home/3/scripting-interface.png"
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
        <div className="flex-[1]" />
        <div className="flex-[2] w-full">
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
      <Section container className="mt-40">
        <SectionHeader badge={<GridaLogo />} title={"A"} excerpt={"aa"} />
      </Section>
      <Section container className="mt-40">
        <SectionFeatures />
      </Section>
      <Section container className="mt-40">
        <SectionExplore />
      </Section>
      <Section container className="mt-40">
        <SectionFAQ />
      </Section>
      <div className="h-96" />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative flex flex-col px-4 lg:px-24 min-h-96 items-start justify-center overflow-visible">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.0, ease: "easeOut" }}
      >
        <div className="flex flex-col items-start text-left">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold pb-8 max-w-2xl">
            From Design to Print, in Just 14 Days
          </h1>
          <p className="max-w-md text-sm md:text-base text-muted-foreground text-left">
            Fast, hassle-free printing for businesses in Nicaragua. Produced in
            South Korea, delivered in just 14 days—faster than US or
            Canada-based services.
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

function MarqueeDemo() {
  return (
    <div className="relative flex w-full flex-col items-center justify-center overflow-hidden">
      <Marquee pauseOnHover className="[--duration:20s]">
        {marqueeitems.map((item) => (
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
      <div className="mt-20">
        <BentoGrid className="grid-cols-4">
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
    </div>
  );
}

function SectionExplore() {
  return (
    <div>
      <SectionHeader
        badge={<Badge>Explore</Badge>}
        title={<>Explore Materials & Templates</>}
        excerpt={<>Explore all features & products.</>}
      />
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
      <Accordion type="single" collapsible className="w-full max-w-3xl mx-auto">
        {faqs.map((faq, index) => (
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
