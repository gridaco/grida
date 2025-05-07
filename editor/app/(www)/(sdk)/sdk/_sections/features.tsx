"use client";
import React from "react";
import { motion } from "motion/react";
import { SectionHeader, SectionHeaderBadge } from "@/www/ui/section";
import { Button } from "@/components/ui/button";
import { sitemap } from "@/www/data/sitemap";
import { BentoGrid, BentoCard, BentoCardContent } from "@/www/ui/bento-grid";
import Link from "next/link";
import Image from "next/image";

const features = [
  {
    name: "React Components",
    description:
      "Use Grida as a React component, or even bring your component into our Canvas.",
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
    name: "Modular SDK",
    description: "Create your own tool. Build on top of our modular SDK.",
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
    name: "Optimized",
    description:
      "Grida is heavily optimized—our compute-intensive modules are powered by Rust and WebGPU for maximum performance.",
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
    name: "Widgets & Templates",
    description: "Drag and drop widgets and icons to quickly build your UI.",
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
    name: "Scripting Interface",
    description:
      "Create design automations & plugins with Runtime scripting interface",
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

function Bento() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      viewport={{ once: true }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.0, ease: "easeOut" }}
      className="w-full mx-0"
    >
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
    </motion.div>
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

export default function Features() {
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
        <Bento />
      </div>
      <DocumentCloudCard />
    </section>
  );
}
