import React from "react";
import styled from "@emotion/styled";
import Head from "next/head";
import Link from "next/link";
import { InferGetStaticPropsType } from "next";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
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
  justify-content: center;
  padding: 80px;

  background: white;

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: center;
  }
`;

export async function getStaticProps() {
  const repo = new FigmaCommunityArchiveMetaRepository();
  const files = repo.page(1, 200);

  return {
    props: {
      files,
    },
  };
}
