import React from "react";
import { Global, css } from "@emotion/react";
import styled from "@emotion/styled";
import Head from "next/head";
import SceneExplorer from "../layout/scene-explorer";
import DevTools from "../layout/dev-tools";

function MyApp({ Component, pageProps }) {
  return (
    <React.Fragment>
      <Global
        styles={css`
          body {
            margin: 0px;
            font-family: "Roboto", sans-serif;
            background-color: #181a22;
          }
        `}
      />
      <Head>
        <SeoMeta />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&"
          rel="stylesheet"
          type="text/css"
        />
      </Head>
      <Template>
        <SceneExplorer />
        <ContentWrapper>
          <RenderComponentWrapper>
            <Component {...pageProps} />
          </RenderComponentWrapper>
          <DevTools />
        </ContentWrapper>
      </Template>
    </React.Fragment>
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

export default MyApp;

const Template = styled.div`
  display: flex;
  width: 100vw;
  height: 100vh;
`;

const ContentWrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 6;
`;

const RenderComponentWrapper = styled.div`
  flex: 3;
`;
