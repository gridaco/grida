import Head from "next/head";
import React from "react";
import "../styles/globals.css";

function MyApp({ Component, pageProps }) {
  return (
    <React.Fragment>
      <SeoMeta />
      <Component {...pageProps} />
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
