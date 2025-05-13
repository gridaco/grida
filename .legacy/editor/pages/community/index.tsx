import styled from "@emotion/styled";
import Head from "next/head";
import React from "react";

export default function FigmaCommunityIndexPage() {
  return (
    <>
      <Head>
        <title>Grida Code - Figma Community</title>
        <meta
          name="description"
          content="Clone and use any Figma community files here"
        />
      </Head>
      <Main></Main>
    </>
  );
}

const Main = styled.main``;
