import React from "react";
import { Html, Head, Main, NextScript } from "next/document";
import { SEO_DEFAULTS } from "utils/seo";
import makeKeywords from "utils/seo/make-keywords";

export default function Document(props) {
  return (
    <Html lang={"en"}>
      <Head>
        <SeoMeta />
        {/* region Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* Nanum Pen Script, Roboto Mono, Inter */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Nanum+Pen+Script&family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* endregion */}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

function SeoMeta() {
  return (
    <>
      <title>{SEO_DEFAULTS.title}</title>
      <link rel="icon" href="/favicon.png" />

      <meta name="description" content={SEO_DEFAULTS.description} />
      <meta name="keywords" content={makeKeywords(SEO_DEFAULTS.keywords)} />
      <meta name="author" content={SEO_DEFAULTS.author} />

      <meta property="og:title" content={SEO_DEFAULTS.og.title} />
      <meta property="og:type" content={SEO_DEFAULTS.og.type} />
      <meta property="og:url" content={SEO_DEFAULTS.og.url} />
      <meta property="og:image" content={SEO_DEFAULTS.og.image} />
    </>
  );
}
