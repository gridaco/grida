import Head from "next/head";
import React from "react";
import { HeroSection } from "sections/assistant/hero";
import { JoinWaitlistSection } from "sections/assistant/join-waitlist";
import { PricingSection } from "sections/assistant/pricing";
import { getPageTranslations } from "utils/i18n";

const figma_plugin_url =
  "https://www.figma.com/community/plugin/896445082033423994";

export default function AssistantLandingpage() {
  return (
    <>
      <Head>
        <title>Grida Assistant</title>
      </Head>
      <main>
        <HeroSection />
        <JoinWaitlistSection />
        <PricingSection />
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
