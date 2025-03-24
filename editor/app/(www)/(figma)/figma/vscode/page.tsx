import Header from "@/www/header";
import Footer from "@/www/footer";
import React from "react";
import CodeTabs from "./tabs";
import { Button } from "@/components/ui/button";

export default function AssistantPage() {
  return (
    <main>
      <Header />
      <Hero />
      <div className="h-60" />
      <Footer />
    </main>
  );
}

function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col p-4 md:p-8">
      <div className="flex flex-col gap-20 mt-60 justify-center items-center">
        <h1 className="font-extrabold text-6xl text-center">VSCode X Grida</h1>
        <a
          href="https://gridaco.slack.com/join/shared_invite/zt-nmf59381-prFEqq032K~aWe_zOekUmQ#"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button className="text-lg" size="lg">
            Join slack to Start
          </Button>
        </a>
        <CodeTabs />
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <iframe
            loading="eager"
            className="w-full h-full"
            src="https://bg.grida.co/embed/shadergradient/89"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
        </div>
      </div>
    </section>
  );
}
