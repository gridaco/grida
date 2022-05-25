import React, { useEffect, useState } from "react";
import { EditPage } from "@app/cms-posts/pages";
import Head from "next/head";
import { themeFrom } from "@app/cms-posts/theme";
import { PostsClient } from "@app/cms-posts/api";
import type { Post, Publication } from "@app/cms-posts/types";

export default function PostEditPage({
  id,
  publication,
  post,
  theme,
}: {
  id: string;
  publication: Publication;
  post: Post;
  theme: any;
}) {
  const { title } = post;

  return (
    <>
      <Head>
        <title>Editing {title}</title>
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
    const post = await client.get(id);

    return {
      props: {
        id,
        publication,
        post,
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
