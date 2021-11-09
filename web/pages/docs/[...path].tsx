import styled from "@emotion/styled";
import DocsNavigation from "layout/docs-navigation";
import ErrorPage from "next/error";
import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";

import Layout from "../../components/docs-mdx/layout";
import PostBody from "../../components/docs-mdx/post-body";
import PostTitle from "../../components/docs-mdx/post-title";
import { getPostByPath, getAllPosts } from "../../utils/docs/api";

export default function Post({ post, preview }) {
  const router = useRouter();
  if (!router.isFallback && !post.slug) {
    return <ErrorPage statusCode={404} />;
  }
  return (
    <Layout preview={preview}>
      <DocsNavigation />
      {router.isFallback ? (
        <PostTitle>Loading…</PostTitle>
      ) : (
        <>
          <Article>
            <Head>
              <title>{post.title}</title>
              {post.ogImage && (
                <meta property="og:image" content={post.ogImage.url} />
              )}
            </Head>
            <PostBody content={post.content} />
          </Article>
        </>
      )}
    </Layout>
  );
}

export async function getStaticProps({
  params,
}: {
  params: { path: string[] };
}) {
  const post = getPostByPath(params.path);

  return {
    props: {
      post: {
        ...post,
        content: post.content,
      },
    },
  };
}

export async function getStaticPaths() {
  const posts = await getAllPosts();
  const paths = posts.map(post => {
    return {
      params: {
        path: post.route,
      },
    };
  });

  return {
    paths: paths,
    fallback: true,
  };
}

const Article = styled.article`
  width: calc(100% - 40px);
  margin: 0px 20px;

  @media screen and (min-width: 768px) {
    width: calc(100% - 320px - 40px);
    /* TEMPORARY! */
    /* 320px is sidebar 250px + sidebar margin 70px */
  }
`;
