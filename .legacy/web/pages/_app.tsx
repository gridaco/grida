import React from "react";
import { Suspense, StrictMode } from "react";
import Head from "next/head";
import { Global, css } from "@emotion/react";
import { GlobalHelpButton } from "@app/fp-customer-support";
import Script from "next/script";

// enable SPA mode, supports react.Suspense; if you don't want to use Suspense, you can use NextJS' dynamic import instead. - on SSR mode
// though, this app does not benefit from SSR.
function SafeHydrate({ children }) {
  return (
    <div suppressHydrationWarning>
      {typeof window === "undefined" ? null : children}
    </div>
  );
}

/**
 * Css normalize - reset all default values.
 */
function CssNormalized() {
  return (
    <Global
      styles={css`
        body {
          margin: 0px;
          padding: 0;
          font-family: "Helvetica Nueue", "Roboto", sans-serif;
        }
        iframe {
          border: none;
        }
      `}
    />
  );
}

function HeadInjection() {
  return (
    <Head>
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&"
        rel="stylesheet"
        type="text/css"
      />
      <CssNormalized />
      <SeoMeta />
    </Head>
  );
}

function ScriptsInjection() {
  return (
    <>
      {/* <!-- Google tag (gtag.js) --> */}
      <Script
        strategy="afterInteractive"
        src="https://www.googletagmanager.com/gtag/js?id=G-TCE3NJ6FWN"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-TCE3NJ6FWN');
        `}
      </Script>
    </>
  );
}

function SeoMeta() {
  const meta = {
    title: "Grida",
    description: "Design, Code and Contents in one place.",
  };

  return (
    <>
      <meta property="title" content={meta.title} />
      <meta property="description" content={meta.description} />
    </>
  );
}

function GridaRootWebApp({ Component, pageProps }) {
  return (
    <>
      <ScriptsInjection />
      <HeadInjection />
      {/* <SafeHydrate> */}
      <GlobalHelpButton />
      {/* <StrictMode> */}
      {/* <Suspense fallback="Loading..."> */}
      <Component {...pageProps} />
      {/* </Suspense> */}
      {/* </StrictMode> */}
      {/* </SafeHydrate> */}
    </>
  );
}

export default GridaRootWebApp;
