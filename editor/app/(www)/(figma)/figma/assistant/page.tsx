import Header from "@/www/header";
import Footer from "@/www/footer";
import React from "react";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Figma Assistant | Grida",
  description: "AI powered design assistant for Figma by Grida.",
};

export default function AssistantPage() {
  return (
    <main>
      <Header />
      <Hero />
      <WaitlistCard />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center text-center p-4 md:p-8">
      <BgSvg className="absolute inset-0 w-full h-full object-cover blur-[70px] md:blur-[100px] z-[-1] overflow-hidden" />
      <div className="max-w-3xl mx-auto">
        <p className="text-white font-medium text-lg md:text-xl mb-4">
          Early Access
        </p>

        <h1 className="text-white text-5xl md:text-7xl font-bold mb-4">
          Your Figma
          <br />
          Assistant
        </h1>

        <p className="text-white text-xl md:text-2xl mb-12">
          Your AI powered Design Assistant
        </p>

        <a
          href="https://www.figma.com/community/plugin/896445082033423994/assistant-by-grida"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button
            variant="outline"
            className="bg-white/20 backdrop-blur-sm border-white/40 text-white hover:bg-white/30 hover:text-white mb-12"
            size="lg"
          >
            <span className="mr-2">⚡</span> Install on Figma
          </Button>
        </a>

        <div className="flex items-center justify-center gap-8">
          <a
            href="https://github.com/gridaco/assistant"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-white gap-2"
          >
            <Github className="size-5" />
            <span>600 Stars</span>
          </a>

          <a
            href="https://www.figma.com/community/plugin/896445082033423994/assistant-by-grida"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center text-white gap-2"
          >
            <span className="text-lg">⚡</span>
            <span>14K Installs</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function WaitlistCard() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="w-full max-w-md lg:max-w-5xl shadow-lg relative overflow-hidden dark:bg-white/10">
        <CardContent className="p-8 md:p-12 flex flex-col items-center text-center relative">
          <h1 className="text-4xl md:text-5xl font-bold mb-8">
            Join the waitlist
          </h1>

          <p className="text-lg  text-foreground max-w-lg mb-10">
            AI Powered Assistant is available to invited users at this moment.
            Join our waitlist for the full access.
          </p>

          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="https://grida.co/d/e/0f9dbc73-a7c6-494d-b233-6e992e9bf916"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="hover:bg-black/90 h-auto text-base">
                Join the waitlist
              </Button>
            </a>
            <a
              href="https://cal.com/universe-from-grida/30min"
              target="_blank"
              rel="noopener noreferrer"
            >
              {" "}
              <Button variant="ghost" className="h-auto text-base">
                Book a Demo
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const BgSvg: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <svg
      width="700"
      height="700"
      viewBox="0 0 426 474"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M339.423 302.387C426.12 303.386 413.336 250.123 396.107 223.366L388.143 216.999C325.838 216.167 187.734 211.482 133.767 199.397C66.308 184.292 67.6683 328.812 113.266 412.951C158.863 497.091 339.423 494.511 356.756 397.887L339.423 302.387Z"
        fill="url(#paint0_linear_264_1382)"
      />
      <path
        d="M388.323 124.55C484.776 62.4899 339.934 15.1285 305.839 41.2136C309.483 46.5869 217.031 89.9826 194.42 18.1166C166.155 -71.7159 110.346 202.531 24.4627 236.654C-103.587 287.53 309.921 235.777 400.962 253.509C492.002 271.241 292.276 186.349 388.323 124.55Z"
        fill="url(#paint1_linear_264_1382)"
      />
      <defs>
        <linearGradient
          id="paint0_linear_264_1382"
          x1="249.795"
          y1="198.524"
          x2="249.795"
          y2="498.063"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF50D8" />
          <stop offset="1" stopColor="#25FFD8" />
        </linearGradient>
        <linearGradient
          id="paint1_linear_264_1382"
          x1="234.148"
          y1="-1.8591"
          x2="234.148"
          y2="265.347"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFA825" />
          <stop offset="1" stopColor="#FF50D8" />
        </linearGradient>
      </defs>
    </svg>
  );
};
