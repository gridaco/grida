import React from "react";
import { EditPage } from "@app/cms-posts/pages";
import Head from "next/head";

export default function PostEditPage() {
  return (
    <>
      <Head>
        <title>New Post</title>
      </Head>
      <EditPage />
    </>
  );
}
