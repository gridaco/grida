import React from "react";
import { FigmaArchiveMetaFile } from "ssg/community-files";
import { InferGetStaticPropsType } from "next";
import Head from "next/head";
import { FileCard } from "components/community-files/file-cards";
import styled from "@emotion/styled";
export default function TagScopedFilesPage({
  tag,
  files,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  return (
    <>
      <Head>
        <title>{tag} | Grida Code - Figma Community</title>
        <meta
          name="description"
          content={`Figma community files with tag ${tag}`}
        />
      </Head>
      <Main>
        <h1>Results for "{tag}"</h1>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          {files.map((f, i) => (
            <FileCard key={i} {...f} />
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
  padding: 80px;
`;

export async function getStaticPaths() {
  // list all tags from meta file
  const repo = new FigmaArchiveMetaFile();

  return {
    paths: repo.tags().map((t) => {
      return {
        params: {
          tag: t,
        },
      };
    }),
    fallback: true,
  };
}

export async function getStaticProps(context) {
  const tag = context.params.tag;
  // get all files with the tag
  const repo = new FigmaArchiveMetaFile();
  const files = repo.query_tag(tag);

  return {
    props: {
      tag,
      files,
    },
  };
}
