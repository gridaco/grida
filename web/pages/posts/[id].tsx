import React, { useEffect, useState } from "react";
import { EditPage } from "@app/cms-posts/pages";
import Head from "next/head";
import { themeFrom } from "@app/cms-posts/theme";
import { PostsClient } from "@app/cms-posts/api";

export default function PostEditPage({ id, publication, theme }) {
  return (
    <>
      <Head>
        <title>Editing </title>
      </Head>
      <EditPage
        theme={themeFrom(theme)}
        publication={publication}
        id={id as string}
      />
    </>
  );
}

import { GetServerSideProps } from "next";
export const getServerSideProps: GetServerSideProps = async ({
  req,
  res,
  query,
}) => {
  const { id } = query as { id: string };
  const client = new PostsClient("627c481391a5de075f80a177");

  res.setHeader(
    "Cache-Control",
    "public, s-maxage=30, stale-while-revalidate=59"
  );

  try {
    const publication = await client.publication();

    return {
      props: {
        id,
        publication,
        theme: {
          background: "#f4e9ce",
          primary: "#be2336",
          title_text_align: "center",
        },
      },
    };
  } catch (e) {
    res.statusCode = 404;

    return {
      notFound: true,
    };
  }
};
