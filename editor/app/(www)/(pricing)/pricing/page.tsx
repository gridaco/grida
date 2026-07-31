import { Pricing } from "@/www/pricing/pricing";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section } from "@/www/ui/section";
import PricingFAQ from "./_sections/faq";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pricing — Grida",
  description:
    "Start free, upgrade to Grida Pro for $20 per month, or contact us for a Custom plan.",
  alternates: {
    canonical: "https://grida.co/pricing",
  },
  openGraph: {
    title: "Pricing — Grida",
    description:
      "Start free, upgrade to Grida Pro for $20 per month, or contact us for a Custom plan.",
    url: "https://grida.co/pricing",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Pricing — Grida",
    description:
      "Start free, upgrade to Grida Pro for $20 per month, or contact us for a Custom plan.",
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
