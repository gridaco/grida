// GRIDA-EE: billing — public pricing and plan acquisition page.

import { Pricing } from "@/www/pricing/pricing";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section } from "@/www/ui/section";
import PricingFAQ from "./_sections/faq";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Grida",
  description:
    "Grida is free and open source, with every product feature included. Pay only for Grida-hosted AI, or bring your own models.",
  alternates: {
    canonical: "https://grida.co/pricing",
  },
  openGraph: {
    title: "Pricing — Grida",
    description:
      "Grida is free and open source, with every product feature included. Pay only for Grida-hosted AI, or bring your own models.",
    url: "https://grida.co/pricing",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pricing — Grida",
    description:
      "Grida is free and open source, with every product feature included. Pay only for Grida-hosted AI, or bring your own models.",
  },
};

export default function WWWPricingPage() {
  return (
    <main>
      <Header />
      <div className="h-40" />
      <Section container>
        <Pricing />
      </Section>
      <Section container className="mt-32">
        <PricingFAQ />
      </Section>
      <div className="h-96" />
      <FooterWithCTA />
    </main>
  );
}
