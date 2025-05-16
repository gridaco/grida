import { type Metadata } from "next";
import { GridaLogo } from "@/components/grida-logo";
import { Button } from "@/components/ui/button";
import { Section } from "@/www/ui/section";
import Hero from "./_sections/hero";
import Demo from "./_sections/demo";
import FAQ from "./_sections/faq";
import Features from "./_sections/features";
import StartFree from "./_sections/start-free";
import Header from "@/www/header";
import Footer from "@/www/footer";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Grida Forms",
  description:
    "Grida Forms is a form builder that helps you create forms with ease.",
  keywords:
    "form builder, free form, form maker, headless forms, free forms api , json form builder, shadcn ui form builder",
};

export default function Home() {
  return (
    <main className="relative">
      <Header className="relative" />
      <Section container className="overflow-visible">
        <Hero />
      </Section>
      <Section container className="mt-32">
        <Demo />
      </Section>
      <Section container className="mt-32">
        <Features />
      </Section>
      <Section container className="mt-32">
        <StartFree />
      </Section>
      <Section container className="mt-32">
        <FAQ />
      </Section>
      <Section container className="mt-32 mb-32">
        <div className="flex flex-col items-center gap-7">
          <GridaLogo />
          <h2 className="text-4xl font-semibold text-center max-w-2xl mx-auto">
            Create Effortlessly, Expand Boundlessly
          </h2>
          <Link href="/dashboard/new?plan=free">
            <Button className="mt-10">Start your project</Button>
          </Link>
        </div>
      </Section>
      <Footer />
    </main>
  );
}
