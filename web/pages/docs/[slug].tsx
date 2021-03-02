import { useRouter } from "next/router";
import ErrorPage from "next/error";
import Container from "../../components/docs-mdx/container";
import PostBody from "../../components/docs-mdx/post-body";
import Header from "../../components/header";
import PostHeader from "../../components/docs-mdx/post-header";
import Layout from "../../components/docs-mdx//layout";
import { getPostBySlug, getAllPosts } from "../../utils/docs/api";
import PostTitle from "../../components/docs-mdx//post-title";
import Head from "next/head";
import markdownToHtml from "../../utils/docs/md-to-html";

export default function Post(/**{ post, morePosts, preview } */) {
  console.log("loading post page");
  const router = useRouter();
  //   console.log("post", post);
  return <div> huhihhihi</div>;
  //   if (!router.isFallback && !post?.slug) {
  //     return <ErrorPage statusCode={404} />;
  //   }
  //   return (
  //     <Layout preview={preview}>
  //       <Container>
  //         <Header />
  //         {router.isFallback ? (
  //           <PostTitle>Loading…</PostTitle>
  //         ) : (
  //           <>
  //             <article className="mb-32">
  //               <Head>
  //                 <title>{post.title} | Next.js Blog Example</title>
  //                 <meta property="og:image" content={post.ogImage.url} />
  //               </Head>
  //               <PostHeader
  //                 title={post.title}
  //                 coverImage={post.coverImage}
  //                 date={post.date}
  //                 author={post.author}
  //               />
  //               <PostBody content={post.content} />
  //             </article>
  //           </>
  //         )}
  //       </Container>
  //     </Layout>
  //   );
}

export async function getStaticProps({ params }) {
  const post = getPostBySlug(params.slug, [
    "title",
    "date",
    "slug",
    "author",
    "content",
    "ogImage",
    "coverImage",
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
  const posts = getAllPosts(["slug"]);

  return {
    paths: posts.map(post => {
      return {
        params: {
          slug: post.slug,
        },
      };
    }),
    fallback: false,
  };
}
