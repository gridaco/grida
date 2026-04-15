import type { Metadata } from "next";
import { Section } from "@/www/ui/section";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import Hero from "./_sections/hero";
import EditorPreview from "./_sections/editor-preview";
import Import from "./_sections/import";
import Statement from "./_sections/statement";

export const metadata: Metadata = {
  title: "Grida Slides - Presentation Design, Rethought",
  description:
    "Vector-native presentation workspace for teams creating polished, scalable decks. Import Figma Slides (.deck), export via CLI, and design with graphics-level precision.",
  keywords: [
    "presentation editor",
    "slide editor",
    "open source slides",
    "figma slides alternative",
    "figma slides import",
    "deck file import",
    "canvas presentation",
    "slides from html",
    "programmatic slides",
    "grida slides",
    "vector slides",
    "slides api",
    "cli slides export",
  ],
};

export default function SlidesPage() {
  return (
    <main className="overflow-x-hidden">
      <Header />
      <div className="relative w-full">
        <Hero />
      </div>
      <Section container className="-mt-20 md:-mt-40">
        <EditorPreview />
      </Section>
      <Section container className="mt-40 md:mt-60">
        <Statement />
      </Section>
      <div className="mt-28 md:mt-40 mb-24 md:mb-32">
        <Import />
      </div>
      <FooterWithCTA />
    </main>
  );
}
