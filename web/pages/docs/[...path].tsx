import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Container from "../../components/docs-mdx/container";
import PostBody from "../../components/docs-mdx/post-body";
import Header from "../../components/docs-mdx/header";
import PostHeader from "../../components/docs-mdx/post-header";
import Layout from "../../components/docs-mdx//layout";
import { getPostByPath, getAllPosts } from "../../utils/docs/api";
import PostTitle from "../../components/docs-mdx//post-title";
import Head from "next/head";
import markdownToHtml from "../../utils/docs/md-to-html";

export default function Post({ post, list, preview }) {
  const router = useRouter();
  if (!router.isFallback && !post.slug) {
    return <ErrorPage statusCode={404} />;
  }
  console.log("list", list);
  return (
    <Layout preview={preview}>
      <Container>
        <Header />
        {router.isFallback ? (
          <PostTitle>Loading…</PostTitle>
        ) : (
          <>
            <article style={{ margin: 200 }}>
              {/* <DocsNavigation /> */}
              <Head>
                <title>{post.title} | Next.js Blog Example</title>
                <meta property="og:image" content={post.ogImage?.url} />
              </Head>
              <PostHeader
                title={post.title}
                coverImage={post.coverImage}
                date={post.date}
                author={post.author}
              />
              <PostBody content={post.content} />
            </article>
          </>
        )}
      </Container>
    </Layout>
  );
}

export async function getStaticProps({
  params,
}: {
  params: { path: string[] };
}) {
  const post = getPostByPath(params.path, [
    "title",
    "date",
    "slug",
    "author",
    "content",
  ]);

  const content = await markdownToHtml(post.content || "");

  return {
    props: {
      post: {
        ...post,
        content,
      },
    },
  };
}

export async function getStaticPaths() {
  const posts = await getAllPosts(["slug"]);
  const paths = posts.map(post => {
    return {
      params: {
        path: post.path,
      },
    };
  });

  return {
    paths: paths,
    fallback: false,
  };
}
