import React from "react";
import { Suspense, StrictMode } from "react";
import { AppRoot } from "@bridged.xyz/app/app";
import Head from "next/head";
import { Global, css } from "@emotion/react";

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
          font-family: "Helvetica Nueue" "Roboto", sans-serif;
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
      <CssNormalized />
      <SeoMeta />
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&"
        rel="stylesheet"
        type="text/css"
      />
    </Head>
  );
}

function SeoMeta() {
  return (
    <>
      <meta property="title" content="Design to Codes" />
      <meta property="description" content="Design to Codes description" />
    </>
  );
}

function BridgedRootWebApp() {
  return (
    <>
      <HeadInjection />
      <SafeHydrate>
        <StrictMode>
          <Suspense fallback="Loading...">
            <AppRoot mode="browser" controlDoubleClick={() => {}} />
          </Suspense>
        </StrictMode>
      </SafeHydrate>
    </>
  );
}

export default BridgedRootWebApp;
