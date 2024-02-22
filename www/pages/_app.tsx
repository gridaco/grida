/* eslint-disable import-helpers/order-imports */
import { ReactElement, ReactNode } from "react";
import { NextPage } from "next";
import { AppProps } from "next/app";
import { ThemeProvider } from "theme";
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
import { BodyCustomStyleInAbosulteSectionLayout } from "utils/styled/styles";
import { MDXProvider } from "@mdx-js/react";
import { _MDX_COMPONENTS } from "components/mdx";
import { Box } from "theme-ui";
import { env } from "process";
import Script from "next/script";
import { RecoilRoot } from "recoil";
import { appWithTranslation } from "next-i18next";
import { PageLayoutConfig } from "layouts/index";
import { HeaderBanner } from "components/banner";
import Link from "next/link";
import "../styles/global.css";

type GetLayoutFunc = (page: ReactElement) => ReactNode;

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: GetLayoutFunc;
  layoutConfig?: PageLayoutConfig;
  getTheme?: () => "light" | "dark" | undefined;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

function defaultLayout(
  page: ReactElement,
  { mt = 60, header }: PageLayoutConfig,
) {
  return (
    <>
      {/* <ThemeProvider theme={ }> */}

      <Header
        banner={
          // promotional banner
          <Link href={"/bundle"}>
            <HeaderBanner>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "black",
                  color: "white",
                  padding: 12,
                }}
              >
                <p
                  style={{
                    maxWidth: 500,
                    fontSize: 14,
                  }}
                >
                  <strong>Check out our latest release</strong> | The Bundle
                  by Grida, A Massive library of 3D Rendered PNGs for UI and
                  Graphics Designs.
                </p>
              </div>
            </HeaderBanner>
          </Link>
        }
      />
      {/* </ThemeProvider> */}
      <BodyCustomStyleInAbosulteSectionLayout
        mt={mt}
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

  const getLayout =
    Component.getLayout ??
    ((page: ReactElement) =>
      defaultLayout(page, Component.layoutConfig ?? ({} as any)));
  const getTheme = Component.getTheme ?? (() => undefined);

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
    <>
      <Head>
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
        <Providers>
          <ThemeProvider fallback="light" override={getTheme() ?? "light"}>
            <PopupProvider>
              {/* @ts-ignore */}
              {getLayout(<Component {...pageProps} />)}
              {renderPopups()}
            </PopupProvider>
          </ThemeProvider>
        </Providers>
      </Box>
    </>
  );
};

const Providers = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <CookiesProvider>
        <MDXProvider components={_MDX_COMPONENTS}>
          <RecoilRoot>{children}</RecoilRoot>
        </MDXProvider>
      </CookiesProvider>
    </>
  );
};

export default appWithTranslation(App);
