import Head from "next/head";
import React from "react";
import { Client } from "@codetest/editor-client";
import Link from "next/link";

export default function QAFilesPage({ files }) {
  return (
    <>
      <Head>
        <title>QA - Files</title>
      </Head>
      <main>
        <h1>QA - Files</h1>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {files.map((file) => (
            <Link
              href={{
                pathname: `/qa/files/[key]`,
                query: {
                  key: file,
                },
              }}
            >
              <a>{file}</a>
            </Link>
          ))}
        </div>
      </main>
    </>
  );
}

export async function getServerSideProps(context: any) {
  const client = Client({
    baseURL: "http://localhost:6627",
  });

  try {
    const { data } = await client.reports();

    return {
      props: {
        files: data.files,
      },
    };
  } catch (e) {
    return {
      notFound: true,
    };
  }
}
