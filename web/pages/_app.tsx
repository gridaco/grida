import Head from "next/head";
import React from "react";
import styled from "@emotion/styled";
import { Menubar } from "layouts";
import { css, Global } from "@emotion/react";

function MyApp({ Component, pageProps }) {
  return (
    <React.Fragment>
      <Global
        styles={css`
          body {
            margin: 0px !important;
            background-color: #212121;
          }
        `}
      />
      <SeoMeta />
      <Wrapper>
        <Header />
        <Content>
          <Menubar />
          <Component {...pageProps} />
          <Right_PropertyList />
        </Content>
      </Wrapper>
    </React.Fragment>
  );
}

export default MyApp;

const SeoMeta = () => {
  return (
    <Head>
      <title>Bridged Studio</title>
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
      <link rel="icon" href="/favicon.ico" />
      {/* TEMPORARY FONT, ROBOTO */}
      <link
        href="https://fonts.googleapis.com/css?family=Roboto:400,100,300,100italic,300italic,400italic,500italic,500,700,700italic,900,900italic"
        rel="stylesheet"
        type="text/css"
      />
    </Head>
  );
};

const Wrapper = styled.div`
  width: 100vw;
  height: 100vh;
`;

const Header = styled.div`
  width: 100%;
  height: 55px;
  background-color: #121212;
  border-bottom: 1px solid #212121;
`;

const Content = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  height: 100%;
`;

const Right_PropertyList = styled.div`
  max-width: 250px;
  width: 100%;
  height: 100%;
  background-color: #121212;
`;
