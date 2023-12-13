import Head from "next/head";
import React from "react";
import { HeroSection } from "sections/assistant/hero";
import { JoinWaitlistSection } from "sections/assistant/join-waitlist";
import { LogosSection } from "sections/assistant/logos";
import { PricingSection } from "sections/assistant/pricing";
import { getPageTranslations } from "utils/i18n";

export default function AssistantLandingpage() {
  return (
    <>
      <Head>
        <title>Grida Assistant</title>
        <meta
          name="description"
          content="Your AI Powered Figma Assistant - Join the waitlist now"
        />
      </Head>
      <main>
        <HeroSection />
        <JoinWaitlistSection />
        <div style={{ height: 100 }} />
        <LogosSection />
        <div style={{ height: 160 }} />
        <PricingSection />
        <div style={{ height: 160 }} />
      </main>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "assistant")),
    },
  };
}
