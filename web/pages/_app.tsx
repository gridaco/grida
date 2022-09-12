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

import "../styles/global.css";
import Script from "next/script";

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
    if (process.env.NODE_ENV === "development") {
      return;
    }
    // region set firebase analytics
    analytics();
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

        {/* region Google analytics */}
        {/* https://stackoverflow.com/a/62552263 */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=UA-196372205-1"
        />
        <Script>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'UA-196372205-1');
        `}
        </Script>
        {/* end region */}

        {/* region Global site tag (gtag.js) - Google Ads: 922132529 */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=AW-922132529"
        />
        <Script>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('set', 'linker', {
		            'domains': ['accounts.grida.co', 'app.grida.co', 'code.grida.co', 'console.grida.co']
		        });
            gtag('js', new Date());
            gtag('config', 'AW-922132529');
        `}
        </Script>

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
