import React from "react";
import { Global, css } from "@emotion/react";
import styled from "@emotion/styled";
import Head from "next/head";
import DevTools from "../layouts/dev-tools";

function GlobalCss() {
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

        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        p {
          color: black;
        }

        a {
          color: blue;
        }
      `}
    />
  );
}

function HeadInjection() {
  return (
    <Head>
      <GlobalCss />
      <SeoMeta />
      <link
        href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&"
        rel="stylesheet"
        type="text/css"
      />
      {/* safari 15 color */}
      <meta
        name="theme-color"
        content="white"
        media="(prefers-color-scheme: light)"
      />
      <meta
        name="theme-color"
        content="#1e1e1e"
        media="(prefers-color-scheme: dark)"
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

function EditorApp({ Component, pageProps }) {
  return (
    <React.Fragment>
      <HeadInjection />
      <Component {...pageProps} />
    </React.Fragment>
  );
}

export default EditorApp;
