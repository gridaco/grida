import Head from "next/head";
import Script from "next/script";
import React from "react";
import { Widget } from "@typeform/embed-react";
import { getPageTranslations } from "utils/i18n";

export default function ContactSalesPage() {
  return (
    <>
      <Head>
        <title>Contact Sales</title>
        <Script src="//embed.typeform.com/next/embed.js" />
      </Head>

      <Widget
        id="i0HCo9XZ"
        style={{
          width: "100%",
          height: "100vh",
        }}
      />
    </>
  );
}

export async function getStaticProps({ locale }) {
  return {
    props: {
      ...(await getPageTranslations(locale)),
    },
  };
}
