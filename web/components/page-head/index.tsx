import Head from "next/head";
import React from "react";
import { PageSeoMeta } from "utils/seo/interface";
import makeKeywords from "utils/seo/make-keywords";

export default function PageHead(props: { pageMeta: PageSeoMeta }) {
  const { pageMeta } = props;
  return (
    <Head>
      <title>{pageMeta.title}</title>
      <meta name="description" content={pageMeta.description} />
      <meta name="keywords" content={makeKeywords(pageMeta.keywords)} />
      <meta name="author" content={pageMeta.author} />
      {pageMeta.og && (
        <>
          <meta property="og:title" content={pageMeta.og.title} />
          <meta property="og:type" content={pageMeta.og.type} />
          <meta property="og:url" content={pageMeta.og.url} />
          <meta property="og:image" content={pageMeta.og.image} />
        </>
      )}
    </Head>
  );
}
