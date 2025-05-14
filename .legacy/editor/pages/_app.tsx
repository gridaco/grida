import React, { useEffect } from "react";
import { Global, css } from "@emotion/react";
import Head from "next/head";
import Script from "next/script";
import { EditorThemeProvider } from "@editor-ui/theme";
import { MuiThemeProvider } from "theme/mui";
import { useRouter } from "next/router";
import "../styles/global.css";

function GlobalCss() {
  return (
    <Global
      styles={css`
        html {
          touch-action: none;
        }
      `}
    />
  );
}

function HeadInjection() {
  return (
    <Head>
      <GlobalCss />

      <title>Grida Code</title>
      <link rel="shortcut icon" href="/favicon.png" />
      <link rel="icon" href="/favicon.png" />
      <meta property="title" content="Design to Codes" />
      <meta property="description" content="Design to Codes description" />

      {/* disable zoom */}
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      />
    </Head>
  );
}

function DefaultScripts() {
  return (
    <>
      {/* disable zoom */}
      <Script id="disable-zoom">
        {
          // wheel + ctrl        - disable zoom on chrome / safari
          // wheel + meta (cmd)  - disable zoom on firefox-mac
          `function init() { document.body.addEventListener("wheel", (event) => {const { ctrlKey, metaKey } = event; if (ctrlKey || metaKey) { event.preventDefault(); return; }}, { passive: false });} window.addEventListener("DOMContentLoaded", init, false);`
        }
      </Script>

      <Script id="disable-context-menu">
        {
          // Disable native context menu on non-input element

          // This lets us open another context menu when one is currently open.
          // This may only be needed if the pointer is a pen.
          // >> document.body.style.pointerEvents = "";
          `function disablecontextmenu() { document.oncontextmenu = (event) => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) { return; } event.preventDefault(); document.body.style.pointerEvents = ""; }; } window.addEventListener("DOMContentLoaded", disablecontextmenu, false);`
        }
      </Script>

      {/* region segment.io */}
      <Script id="segment-io">
        {`
          !function(){var analytics=window.analytics=window.analytics||[];if(!analytics.initialize)if(analytics.invoked)window.console&&console.error&&console.error("Segment snippet included twice.");else{analytics.invoked=!0;analytics.methods=["trackSubmit","trackClick","trackLink","trackForm","pageview","identify","reset","group","track","ready","alias","debug","page","once","off","on","addSourceMiddleware","addIntegrationMiddleware","setAnonymousId","addDestinationMiddleware"];analytics.factory=function(e){return function(){var t=Array.prototype.slice.call(arguments);t.unshift(e);analytics.push(t);return analytics}};for(var e=0;e<analytics.methods.length;e++){var key=analytics.methods[e];analytics[key]=analytics.factory(key)}analytics.load=function(key,e){var t=document.createElement("script");t.type="text/javascript";t.async=!0;t.src="https://cdn.segment.com/analytics.js/v1/" + key + "/analytics.min.js";var n=document.getElementsByTagName("script")[0];n.parentNode.insertBefore(t,n);analytics._loadOptions=e};analytics._writeKey="5If7uflRdGBGyCiy7WpBBCSUUqe6YSwC";;analytics.SNIPPET_VERSION="4.15.3";
          analytics.load("5If7uflRdGBGyCiy7WpBBCSUUqe6YSwC");
          analytics.page();
          }}();
        `}
      </Script>
      {/* endregion */}

      {/* region Google analytics */}
      {/* https://stackoverflow.com/a/62552263 */}
      <Script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-7Y9DGWF5RT"
      />
      <Script id="google-analytics">
        {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7Y9DGWF5RT');
        `}
      </Script>
      {/* end region */}
    </>
  );
}

function EditorApp({ Component, pageProps }) {
  const router = useRouter();
  const _path = router.asPath.replace("/", "");
  const analyzed = analyze_dynamic_input(_path);
  useEffect(() => {
    if (pageProps.statusCode == 404 && analyzed) {
      switch (analyzed.ns) {
        case "figma": {
          const { file, node } = parseFileAndNodeId(_path) ?? {};
          switch (analyzed.result) {
            case "node": {
              router.replace("/files/[key]/[node]", `/files/${file}/${node}`);
              break;
            }
            case "file": {
              router.replace("/files/[key]", `/files/${file}`);
              break;
            }
            case "empty":
            default: {
              break;
            }
          }
          break;
        }
        case "unknown":
        default: {
          break;
        }
      }
    }
  }, [analyzed]);

  return (
    <>
      <HeadInjection />
      <DefaultScripts />
      <MuiThemeProvider>
        <EditorThemeProvider dark>
          <Component {...pageProps} />
        </EditorThemeProvider>
      </MuiThemeProvider>
    </>
  );
}

export default EditorApp;

import {
  analyze as figmaurlAnalize,
  parseFileAndNodeId,
} from "@design-sdk/figma-url";

function analyze_dynamic_input(input: string) {
  const _isurl = isurl(input);
  if (_isurl) {
    return {
      ns: "figma",
      result: figmaurlAnalize(input),
    };
  }

  return {
    ns: "unknown",
    result: input,
  };
}

const isurl = (s: string) => {
  try {
    new URL(s);
    return true;
  } catch (e) {
    return false;
  }
};
