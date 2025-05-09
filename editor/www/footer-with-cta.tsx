import React from "react";
import Footer from "./footer";
import { Button, Button as FancyButton } from "@/www/ui/button";
import { sitemap } from "./data/sitemap";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { Section } from "./ui/section";
import { cn } from "@/components/lib/utils";
import Link from "next/link";

export default function FooterWithCTA() {
  return (
    <SectionFooterContainer className="flex flex-col">
      <Section className="flex-1">
        <SectionCTA />
      </Section>
      <Footer />
    </SectionFooterContainer>
  );
}

function SectionFooterContainer({
  className,
  children,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative w-full h-full min-h-screen rounded-t-3xl md:rounded-t-[50px] overflow-hidden border-t",
        className
      )}
    >
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <iframe
          loading="eager"
          className="w-full h-full"
          src="https://bg.grida.co/embed/shadergradient/88"
        />
        {/* gradient for footer visibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
      </div>
      {children}
    </div>
  );
}

function SectionCTA() {
  return (
    <div className="container py-40 z-10">
      <div className="flex flex-col">
        <h2 className="text-left text-4xl md:text-5xl lg:text-6xl font-semibold">
          The Free & Open Canvas
        </h2>
        <div className="flex gap-4 mt-20">
          <Link href={sitemap.links.cta}>
            <FancyButton
              effect="expandIcon"
              className="flex gap-2 group"
              icon={ArrowRightIcon}
              iconPlacement="right"
            >
              <span>Start your project</span>
            </FancyButton>
          </Link>
          <Link href={sitemap.links.canvas}>
            <Button variant="outline" className=" bg-transparent border-none">
              Try the demo
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
