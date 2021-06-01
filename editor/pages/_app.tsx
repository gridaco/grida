import React from "react";
import { Global, css } from "@emotion/react";
import styled from "@emotion/styled";
import Head from "next/head";
import DevTools from "../layout/dev-tools";

function GlobalCss() {
  return (
    <Global
      styles={css`
        body {
          margin: 0px;
          font-family: "Roboto", sans-serif;
          background-color: #181a22;
        }

        h1,
        h2,
        h3,
        h4,
        h5,
        h6,
        p {
          color: white;
        }

        a {
          color: grey;
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
