import React, { useEffect } from "react";
import { Global, css } from "@emotion/react";
import Head from "next/head";
import { EditorThemeProvider } from "@editor-ui/theme";
import { colors } from "theme";
import { useRouter } from "next/router";

function GlobalCss() {
  return (
    <Global
      styles={css`
        html {
          background-color: ${colors.color_editor_bg_on_dark};
          touch-action: none;
        }

        body {
          margin: 0px;
          padding: 0;
          font-family: "Helvetica Nueue", "Roboto", sans-serif;

          /* for editor canvas */
          overscroll-behavior-x: none;
          overscroll-behavior-y: none;
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
        content={colors.color_editor_bg_on_dark}
        media="(prefers-color-scheme: dark)"
      />

      {/* disable zoom */}
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `function init() { document.body.addEventListener("wheel", (event) => {const { ctrlKey } = event; if (ctrlKey) { event.preventDefault(); return; }}, { passive: false });} window.addEventListener("DOMContentLoaded", init, false);`,
        }}
      />

      {/* region Google analytics */}
      {/* https://stackoverflow.com/a/62552263 */}
      <script
        async
        src="https://www.googletagmanager.com/gtag/js?id=G-7Y9DGWF5RT"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-7Y9DGWF5RT');
        `,
        }}
      />
      {/* end region */}
    </Head>
  );
}

function SeoMeta() {
  return (
    <>
      <title>Grida: Design to Code</title>
      <link rel="shortcut icon" href="/favicon.png" />
      <link rel="icon" href="/favicon.png" />
      <meta property="title" content="Design to Codes" />
      <meta property="description" content="Design to Codes description" />
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
    <React.Fragment>
      <HeadInjection />
      <EditorThemeProvider dark>
        <Component {...pageProps} />
      </EditorThemeProvider>
    </React.Fragment>
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
