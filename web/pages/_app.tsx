/* eslint-disable import-helpers/order-imports */
import { ReactElement, ReactNode } from "react";
import { NextPage } from "next";
import { AppProps } from "next/app";
import { ThemeProvider } from "@emotion/react";
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
import theme from "theme";
import { BodyCustomStyleInAbosulteSectionLayout } from "utils/styled/styles";

import { MDXProvider } from "@mdx-js/react";

import { _MDX_COMPONENTS } from "components/mdx";
import { SEO_DEFAULTS } from "utils/seo";
import makeKeywords from "utils/seo/make-keywords";

import { Box } from "rebass";
import { env } from "process";

import "../styles/styles.css";

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
  getTheme?: () => "system" | "light" | "dark";
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function defaultLayout(page: ReactElement) {
  return (
    <>
      <Header />
      <BodyCustomStyleInAbosulteSectionLayout
        mt="60px"
        style={{ position: "relative" }}
      >
        {page}
      </BodyCustomStyleInAbosulteSectionLayout>
      <Footer />
    </>
  );
}

const App = ({ Component, pageProps }: AppPropsWithLayout) => {
  const router = useRouter();

  const getLayout = Component.getLayout ?? defaultLayout;
  const getTheme = Component.getTheme ?? (() => "system");

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
      <Head>
        <SeoMeta />
        {/* pinterest domain verify */}
        <meta
          name="p:domain_verify"
          content={env.NEXT_PUBLIC_P_DOMAIN_VERIFY}
        />

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
      </Head>
      <Box
        style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}
      >
        {getLayout(<Component {...pageProps} />)}
      </Box>
      {renderPopups()}
    </Providers>
  );
};

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

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <PopupProvider>
      <CookiesProvider>
        <MDXProvider components={_MDX_COMPONENTS}>
          <ThemeProvider theme={theme}>{children}</ThemeProvider>
        </MDXProvider>
      </CookiesProvider>
    </PopupProvider>
  );
};

export default App;
