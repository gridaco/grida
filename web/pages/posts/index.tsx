import React, { useEffect, useState } from "react";
import { TablePage } from "@app/cms-posts/pages";
import { themeFrom } from "@app/cms-posts/theme";
import { PostsClient } from "@app/cms-posts/api";
import { useRouter } from "next/router";
import { GetServerSideProps } from "next";
import type { Post } from "@app/cms-posts/types";
import Head from "next/head";

export default function WebPostsPage({ publication, theme }) {
  const router = useRouter();

  const [posts, setPosts] = useState<Post[]>([]);
  const client = new PostsClient("627c481391a5de075f80a177");

  useEffect(() => {
    client.posts().then(setPosts);
  }, []);

  const onPostClick = (id) => {
    router.push("/posts/" + id);
  };

  const onPostDeleteClick = (id) => {
    client.deletePost(id);
    setPosts(posts.filter((post) => post.id !== id));
  };

  const onPostPublishClick = (id) => {
    client.publish(id);
    setPosts(
      posts.map((post) => {
        if (post.id === id) {
          post.isListed = true;
        }
        return post;
      })
    );
  };

  const onPostUnlistClick = (id) => {
    client.unlist(id);
    setPosts(
      posts.map((post) => {
        if (post.id === id) {
          post.isListed = false;
        }
        return post;
      })
    );
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
        onPostDeleteClick={onPostDeleteClick}
        onPostUnlistClick={onPostUnlistClick}
        onPostPublishClick={onPostPublishClick}
      />
    </>
  );
}

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
