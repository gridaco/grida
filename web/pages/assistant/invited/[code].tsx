import React from "react";
import Head from "next/head";
import { getPageTranslations } from "utils/i18n";

export default function AssistantInvitedPage() {
  return (
    <>
      <Head>
        <title>Grida Assistant</title>
      </Head>
      <main>Hi</main>
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

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  };
}
