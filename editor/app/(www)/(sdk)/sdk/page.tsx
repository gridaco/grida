import React from "react";
import { Section } from "@/www/ui/section";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import Hero from "./_sections/hero";
import Features from "./_sections/features";
import CodeExample from "./_sections/snippets";
import SectionMainDemo from "./_sections/demo";
import FAQ from "./_sections/faq";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida Canvas SDK - Build Your Own Canvas Framework | Open Source",
  description:
    "Integrate powerful canvas capabilities into your application with Grida SDK. Open-source, TypeScript-first canvas framework for developers. Build custom canvas experiences with our flexible and performant SDK.",
  keywords: [
    "canvas framework",
    "canvas sdk",
    "open source canvas",
    "typescript canvas",
    "web canvas",
    "canvas library",
    "canvas development",
    "grida sdk",
    "canvas framework javascript",
    "canvas framework typescript",
    "canvas framework react",
  ],
};

export default function SDKPage() {
  return (
    <main className="overflow-x-hidden">
      <Header className="relative" />
      <div className="w-full relative">
        <Section container className="overflow-visible">
          <Hero />
        </Section>
      </div>
      <Section container className="mt-32">
        <SectionMainDemo />
      </Section>
      <Section container className="mt-32">
        <Features />
      </Section>
      <Section container className="mt-32 mb-32">
        <FAQ />
      </Section>
      <FooterWithCTA />
    </main>
  );
}
