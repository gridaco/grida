import React from "react";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import { InferGetServerSidePropsType } from "next";
import Head from "next/head";
import { FileCard } from "components/community-files/file-cards";
import styled from "@emotion/styled";
import Link from "next/link";
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
      <Main>
        <h1>Files with #{tag}</h1>
        <div className="grid">
          {files.map((f, i) => (
            <Link
              href={{
                pathname: "/community/file/[id]",
                query: {
                  id: f.id,
                },
              }}
              key={i}
            >
              <div>
                <FileCard {...f} />
              </div>
            </Link>
          ))}
        </div>
      </Main>
    </>
  );
}

const Main = styled.main`
  background: white;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px;

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: center;
  }
`;

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
