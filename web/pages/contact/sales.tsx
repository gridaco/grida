import Head from "next/head";
import Script from "next/script";
import React from "react";
import { Widget } from "@typeform/embed-react";

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
