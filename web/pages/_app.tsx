import { Global, css } from "@emotion/core";
import { ThemeProvider } from "emotion-theming";
import { AppProps } from "next/app";
import Head from "next/head";
import React, { useEffect } from "react";
import { CookiesProvider } from "react-cookie";

import Footer from "components/footer";
import Header from "components/header";
import { defaultTheme } from "utils/styled";
import { useRouter } from "next/router";
import {
  PopupConsumer,
  PopupInfo,
  PopupProvider,
} from "utils/context/PopupContext";
import Popup from "components/popup";
import { analytics } from "utils/firebase";
import { BodyCustomStyleInAbosulteSectionLayout } from "utils/styled/styles";
import "../utils/styled/fonts.css";
import { MDXProvider } from "@mdx-js/react";
import { _MDX_COMPONENTS } from "components/mdx";

const App = ({ Component, pageProps }: AppProps) => {
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
  }, [router.events, router.pathname]);

  const renderPopups = () => {
    return (
      <PopupConsumer>
        {state =>
          (state[0].popupList as PopupInfo[]).map(popup => (
            <Popup key={popup.id} info={popup} />
          ))
        }
      </PopupConsumer>
    );
  };

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

          .cursor {
            cursor: pointer;
          }

          .no-drag {
            user-select: none;
          }

          input {
            box-sizing: border-box;
          }

          a {
            text-decoration: none;
            color: inherit;
          }

          p {
            margin-block-start: 0.3em;
            margin-block-end: 0.3em;
          }

          body,
          button,
          input,
          textarea,
          h1,
          h2,
          h3 {
            font-family: HelveticaNeue, sans-serif !important;
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
      </Head>
      <div
        css={css`
          display: flex;
          flex-direction: column;
          min-height: 100vh;
        `}
      >
        <Header />
        <BodyCustomStyleInAbosulteSectionLayout
          mt="60px"
          style={{ position: "relative" }}
        >
          <Component {...pageProps} />
        </BodyCustomStyleInAbosulteSectionLayout>
        <Footer />
      </div>
      {renderPopups()}
    </Providers>
  );
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <PopupProvider>
      <CookiesProvider>
        <MDXProvider components={_MDX_COMPONENTS}>
          <ThemeProvider theme={defaultTheme}>{children}</ThemeProvider>
        </MDXProvider>
      </CookiesProvider>
    </PopupProvider>
  );
};

export default App;
