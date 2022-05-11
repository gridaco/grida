import React from "react";
import { TablePage } from "@app/cms-posts/pages";
import { useRouter } from "next/router";
import Head from "next/head";

export default function WebPostsPage() {
  const router = useRouter();

  const onPostClick = (id) => {
    router.push("/posts/" + id);
  };

  return (
    <>
      <Head>
        <title>Posts</title>
      </Head>
      <TablePage onPostClick={onPostClick} />
    </>
  );
}
