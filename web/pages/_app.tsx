import { Global, css } from "@emotion/core";
import { ThemeProvider } from "emotion-theming";
import { AppProps } from "next/app";
import Head from "next/head";
import React, { useEffect } from "react";

import Footer from "components/footer";
import Header from "components/header";
import Fonts from "components/fonts";
import { defaultTheme } from "utils/styled";
import { useRouter } from "next/router";
import { Box } from "rebass";
import { analytics } from "utils/firebase";

const MyApp = ({ Component, pageProps }: AppProps) => {
  const router = useRouter();

  useEffect(() => {
    // region set firebase analytics
    try {
      analytics();
    } catch (_) {
      console.error(
        "seems like you are a contributor! ignore this message since this is a warning that we could not find firebase credentials to initialize.",
      );
    }
    // endregion set firebase analytics

    Fonts();
  }, [router.events, router.pathname]);

  return (
    <Providers>
      <Global
        styles={css`
          html,
          body,
          #__next {
            padding: 0;
            margin: 0;
            word-break: keep-all;
            letter-spacing: -0.65px;
            min-height: 100vh;
            overflow-x: hidden;
            scroll-behavior: smooth;
            @media (prefers-reduced-motion: reduce) {
                scroll-behavior: auto;
            }
          }

          .no-drag {
            -ms-user-select: none; 
            -moz-user-select: -moz-none; 
            -webkit-user-select: none; 
            -khtml-user-select: none; 
            user-select:none;
          }

          input {
            box-sizing: border-box;
          }

          a {
            text-decoration: none;
            color: inherit;
            cursor: pointer;
          }

          p {
            margin-block-start: 0.3em;
            margin-block-end: 0.3em;
          }

          .cursor {
            cursor: pointer;
          }

          .fonts-loaded {
            body,
            button,
            input,
            textarea,
            h1,
            h2,
            h3 {
              font-family: "Roboto", sans-serif;
            }
          }

          button {
            outline: none;
          }
        `}
      />
      <Head>
        <title>bridged.xyz</title>
        <meta
          name="description"
          content="designs that are meant to be implemented. automate your frontend development process. no more boring."
        />
        <meta
          name="keywords"
          content="flutter, design to code, figma to code, flutter code generation, design handoff, design linting, code generation"
        />
        <meta
          name="author"
          content="bridged.xyz team and community collaborators"
        />
        <link rel="icon" href="/favicon.png" />
        <link
          href="https://fonts.googleapis.com/css?family=Roboto:400,100,300,100italic,300italic,400italic,500italic,500,700,700italic,900,900italic"
          rel="stylesheet"
          type="text/css"
        />
        <script defer src="https://unpkg.com/smoothscroll-polyfill@0.4.4/dist/smoothscroll.min.js"></script>
      </Head>
      <div
        css={css`
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        `}
      >
        <Header />
        <Box mt="60px">
          <Component {...pageProps} />
        </Box>
        <Footer />
      </div>
    </Providers>
  );
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  return <ThemeProvider theme={defaultTheme}>{children}</ThemeProvider>;
};

export default MyApp;
