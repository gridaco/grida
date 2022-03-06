/* eslint-disable import-helpers/order-imports */
import { Global, css } from "@emotion/core";
import { ThemeProvider } from "emotion-theming";
import { AppProps } from "next/app";
import Head from "next/head";
import { useRouter } from "next/router";
import React, { useEffect } from "react";
import { CookiesProvider } from "react-cookie";

import Footer from "components/footer";
import Header from "components/header";
import Popup from "components/popup";
import {
  PopupConsumer,
  PopupInfo,
  PopupProvider,
} from "utils/context/PopupContext";
import { analytics } from "utils/firebase";
import { defaultTheme } from "utils/styled";
import { BodyCustomStyleInAbosulteSectionLayout } from "utils/styled/styles";

import "../utils/styled/fonts.css";
import { MDXProvider } from "@mdx-js/react";

import { _MDX_COMPONENTS } from "components/mdx";
import { SEO_DEFAULTS } from "utils/seo";
import makeKeywords from "utils/seo/make-keywords";

import { Box } from "rebass";
import { env } from "process";

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
          h3,
          h4,
          h5,
          h6 {
            font-family: HelveticaNeue, sans-serif !important;
          }

          button {
            outline: none;
          }
        `}
      />
      <Head>
        <title>{SEO_DEFAULTS.title}</title>
        <meta name="description" content={SEO_DEFAULTS.description} />
        <meta name="keywords" content={makeKeywords(SEO_DEFAULTS.keywords)} />
        <meta name="author" content={SEO_DEFAULTS.author} />

        <meta property="og:title" content={SEO_DEFAULTS.og.title} />
        <meta property="og:type" content={SEO_DEFAULTS.og.type} />
        <meta property="og:url" content={SEO_DEFAULTS.og.url} />
        <meta property="og:image" content={SEO_DEFAULTS.og.image} />

        {/* pinterest domain verify */}
        <meta
          name="p:domain_verify"
          content={env.NEXT_PUBLIC_P_DOMAIN_VERIFY}
        />

        {/* region Nanum Pen Script Font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Nanum+Pen+Script&display=swap"
          rel="stylesheet"
        ></link>
        {/* endregion */}

        {/* region Google analytics */}
        {/* https://stackoverflow.com/a/62552263 */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=UA-196372205-1"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'UA-196372205-1');
        `,
          }}
        />
        {/* end region */}

        {/* region Global site tag (gtag.js) - Google Ads: 922132529 */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-922132529"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('set', 'linker', {
		            'domains': ['accounts.grida.co', 'app.grida.co', 'code.grida.co', 'console.grida.co']
		        });
            gtag('js', new Date());
            gtag('config', 'AW-922132529');
        `,
          }}
        />
        {/* end region */}

        <link rel="icon" href="/favicon.png" />
      </Head>
      <Box
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        <Header />
        <BodyCustomStyleInAbosulteSectionLayout
          mt="60px"
          style={{ position: "relative" }}
        >
          <Component {...pageProps} />
        </BodyCustomStyleInAbosulteSectionLayout>
        <Footer />
      </Box>
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
