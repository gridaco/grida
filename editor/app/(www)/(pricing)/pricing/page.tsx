import { Pricing } from "@/www/pricing/pricing";
import Header from "@/www/header";
import FooterWithCTA from "@/www/footer-with-cta";
import { Section } from "@/www/ui/section";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida Pricing",
  description: "Choose a plan that fits your needs.",
};

export default function WWWPricingPage() {
  return (
    <main>
      <Header />
      <div className="h-40" />
      <Section container>
        <Pricing />
      </Section>
      <div className="h-96" />
      <FooterWithCTA />
    </main>
  );
}
