import React, { useEffect, useState } from "react";
import { EditPage } from "@app/cms-posts/pages";
import Head from "next/head";
import { useRouter } from "next/router";
import { PostsClient } from "@app/cms-posts/api";

export default function PostEditPage() {
  const [publication, setPublication] = useState<any>({});
  const router = useRouter();
  const client = new PostsClient("627c481391a5de075f80a177");
  const { id } = router.query;

  useEffect(() => {
    client.publication().then(setPublication);
  }, []);

  return (
    <>
      <Head>
        <title>Editing </title>
      </Head>
      {id && <EditPage publication={publication} id={id as string} />}
    </>
  );
}
