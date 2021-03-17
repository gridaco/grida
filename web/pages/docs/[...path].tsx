import React from "react";
import { useRouter } from "next/router";
import ErrorPage from "next/error";
import PostBody from "../../components/docs-mdx/post-body";
import Layout from "../../components/docs-mdx/layout";
import { getPostByPath, getAllPosts } from "../../utils/docs/api";
import PostTitle from "../../components/docs-mdx/post-title";
import Head from "next/head";
import markdownToHtml from "../../utils/docs/md-to-html";
import DocsNavigation from "layout/docs-navigation";

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
          <article style={{ width: "100%" }}>
            <Head>
              <title>{post.title}</title>
              {post.ogImage && (
                <meta property="og:image" content={post.ogImage.url} />
              )}
            </Head>
            <PostBody content={post.content} />
          </article>
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
    fallback: false,
  };
}
