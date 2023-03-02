import React from "react";
import Head from "next/head";
import { getPageTranslations } from "utils/i18n";
import { HeroSection } from "sections/assistant/hero";
import { JoinWithCodeSection } from "sections/assistant/join-with-code";

export default function AssistantInvitedPage() {
  return (
    <>
      <Head>
        <title>Grida Assistant Early bird</title>
      </Head>
      <main>
        <HeroSection />
        <div style={{ position: "relative", top: -240 }}>
          <JoinWithCodeSection />
        </div>
      </main>
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale, "assistant/invited")),
    },
  };
}
