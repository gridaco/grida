import React from "react";
import styled from "@emotion/styled";
import Head from "next/head";
import Link from "next/link";
import { InferGetStaticPropsType } from "next";
import { FigmaArchiveMetaFile } from "ssg/community-files";
import { FileCard } from "components/community-files/file-cards";

export default function FigmaCommunityFilesIndexPage({
  files,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  // TODO: infinite scrolling, load more

  return (
    <>
      <Head>
        <title>Grida Code - Figma Community Files</title>
      </Head>
      <Main>
        <h1>Explore Code-Ready Figma Community Files</h1>
        <div className="grid">
          {files.map((file) => (
            <Link
              key={file.id}
              href={{
                pathname: "/community/file/[id]",
                query: {
                  id: file.id,
                },
              }}
            >
              <div>
                <FileCard {...file} />
              </div>
            </Link>
          ))}
        </div>
      </Main>
    </>
  );
}

const Main = styled.main`
  display: flex;
  flex-direction: column;
  align-items: center;
  background: white;

  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-gap: 24px;
  }

  padding: 100px;
`;

export async function getStaticProps() {
  const repo = new FigmaArchiveMetaFile();
  const files = repo.page(1, 200);

  return {
    props: {
      files,
    },
  };
}
