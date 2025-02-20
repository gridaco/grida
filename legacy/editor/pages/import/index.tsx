import Head from "next/head";
import React from "react";
import { HomeInput } from "scaffolds/home-input";

export default function ImportPage() {
  return (
    <>
      <Head>
        <title>Grida - Import Design</title>
        <meta name="description" content="Import your design from Figma" />
      </Head>
      <HomeInput />
    </>
  );
}
