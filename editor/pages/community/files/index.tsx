import React from "react";
import Head from "next/head";
import { InferGetStaticPropsType } from "next";
import { FigmaCommunityArchiveMetaRepository } from "ssg/community";
import styled from "@emotion/styled";
import Link from "next/link";
import { FileCard } from "components/community-files/file-cards";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useRouter } from "next/router";
export default function FigmaCommunityFilesIndexPage({
  page: pageStart,
  files,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const router = useRouter();
  const [page, setPage] = React.useState(pageStart);

  return (
    <>
      <Head>
        <title>Grida Code - Figma Community Files</title>
      </Head>
      <Main>
        <h1>Community Files</h1>
        <p>Explore 20,000+ Code-Ready Community Files from Figma</p>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            // get with id 'q'
            const q = e.target["elements"]["q"].value;
            router.push({
              pathname: "/community/search",
              query: {
                q,
              },
            });
          }}
        >
          <MagnifyingGlassIcon />
          <input id="q" type="search" placeholder="Search" autoComplete="off" />
        </form>
        <div>
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

  color: white !important;
  p,
  h1 {
    color: white;
    text-align: center;
  }

  h1 {
    font-size: 48px;
  }

  p {
    opacity: 0.6;
  }

  .search {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 16px;
    margin: 40px 0 80px 0;
    padding: 12px 16px;
    width: 100%;
    background: rgba(0, 0, 0, 0.5);
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    max-width: 600px;

    input {
      background: none;
      width: 100%;
      border: none;
      font-size: 16px;
      font-weight: 500;
      color: white;
      outline: none;
    }
  }

  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    align-items: center;
    justify-content: center;
  }
`;

export async function getStaticProps() {
  const repo = new FigmaCommunityArchiveMetaRepository();
  const page = 1;
  const files = repo.page(page);

  return {
    props: {
      files,
      page,
    },
  };
}
