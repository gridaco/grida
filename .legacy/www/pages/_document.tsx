import React from "react";
import { Html, Head, Main, NextScript, DocumentProps } from "next/document";
import { SEO_DEFAULTS } from "utils/seo";
import i18nextConfig from "../next-i18next.config";
import { keywords } from "utils/seo";

export default function Document(props: DocumentProps) {
  const currentLocale =
    (props.__NEXT_DATA__.query.locale as string) ||
    i18nextConfig.i18n.defaultLocale;

  return (
    <Html lang={currentLocale}>
      <Head>
        <DefaultSeoMeta />
        {/* region Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* (en) Nanum Pen Script (+ ko), Roboto Mono, Inter */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Nanum+Pen+Script&family=Roboto+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* (en) Caveat */}
        <link
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* (ja) Hachi Maru Pop */}
        <link
          href="https://fonts.googleapis.com/css2?family=Hachi+Maru+Pop&display=swap"
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

function DefaultSeoMeta() {
  return (
    <>
      <link rel="icon" href="/favicon.png" />

      <meta name="description" content={SEO_DEFAULTS.description} />
      <meta name="keywords" content={keywords(SEO_DEFAULTS.keywords)} />
      <meta name="author" content={SEO_DEFAULTS.author} />

      <meta property="og:type" content={SEO_DEFAULTS.og.type} />
      <meta property="og:url" content={SEO_DEFAULTS.og.url} />
      <meta property="og:image" content={SEO_DEFAULTS.og.image} />
    </>
  );
}
