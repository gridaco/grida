import React, { useEffect, useState } from "react";
import { TablePage } from "@app/cms-posts/pages";
import { themeFrom } from "@app/cms-posts/theme";
import { PostsClient } from "@app/cms-posts/api";
import { useRouter } from "next/router";
import Head from "next/head";

export default function WebPostsPage({ publication, theme }) {
  const router = useRouter();

  const [posts, setPosts] = useState([]);
  const client = new PostsClient("627c481391a5de075f80a177");

  useEffect(() => {
    client.posts().then(setPosts);
  }, []);

  const onPostClick = (id) => {
    router.push("/posts/" + id);
  };

  const onNewPostClick = async () => {
    const { id } = await client.draft({});
    router.push("/posts/" + id);
  };

  const title = publication.name;

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <TablePage
        theme={themeFrom(theme)}
        title={title}
        publication={publication}
        posts={posts}
        onPostClick={onPostClick}
        onNewPostClick={onNewPostClick}
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
        publication,
        theme: {
          background: "#f4e9ce",
          primary: "#be2336",
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
