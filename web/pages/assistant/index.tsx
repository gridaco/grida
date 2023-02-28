import Head from "next/head";
import React from "react";
import { HeroSection } from "sections/assistant/hero";
import { JoinWaitlistSection } from "sections/assistant/join-waitlist";
import { PricingSection } from "sections/assistant/pricing";
import { getPageTranslations } from "utils/i18n";

export default function AssistantLandingpage() {
  return (
    <>
      <Head>
        <title>Grida Assistant</title>
      </Head>
      <main>
        <HeroSection />
        <JoinWaitlistSection />
        <div style={{ height: 210 }} />
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
