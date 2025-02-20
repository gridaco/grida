import React from "react";
import Head from "next/head";
import { InferGetServerSidePropsType } from "next";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import { CommunityResultsLayout } from "layout/community/results-layout";

export default function TagScopedFilesPage({
  tag,
  files,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <>
      <Head>
        <title>Files with #{tag} | Grida Code - Figma Community</title>
        <meta
          name="description"
          content={`Figma community files with tag ${tag}`}
        />
      </Head>
      <CommunityResultsLayout
        heading={<h1>Files with #{tag}</h1>}
        files={files}
      />
    </>
  );
}

export async function getServerSideProps(context) {
  // we use serverside props here, since there are too many of them.
  const tag = context.params.tag;
  // get all files with the tag
  const repo = new FigmaCommunityArchiveMetaRepository();
  const files = repo.query_tag(tag);

  return {
    props: {
      tag,
      files,
    },
  };
}

// TODO: custom sitemap.xml generation
// export async function getStaticPaths() {
//   // list all tags from meta file
//   const repo = new FigmaArchiveMetaFile();

//   return {
//     paths: repo.tags().map((t) => {
//       return {
//         params: {
//           tag: t,
//         },
//       };
//     }),
//     fallback: true,
//   };
// }
