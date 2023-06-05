import React from "react";
import Head from "next/head";
import { InferGetServerSidePropsType } from "next";
import { CommunityResultsLayout } from "layout/community/results-layout";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";

export default function CommunitySearchResultPage({
  files,
  q,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Files matching "{q}" | Grida Code Community</title>
      </Head>
      <CommunityResultsLayout
        heading={<h1>Files matching "{q}"</h1>}
        files={files}
      />
    </>
  );
}

export async function getServerSideProps(context) {
  const q = context.query.q;

  const repo = new FigmaCommunityArchiveMetaRepository();
  const files = repo.q({ q });

  return {
    props: {
      q,
      files,
    },
  };
}
