import React from "react";
import { EditPage } from "@app/cms-posts/pages";
import Head from "next/head";
import { useRouter } from "next/router";

export default function PostEditPage() {
  const router = useRouter();

  const { id } = router.query;

  return (
    <>
      <Head>
        <title>Editing </title>
      </Head>
      {id && <EditPage id={id as string} />}
    </>
  );
}
