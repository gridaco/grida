import React from "react";
import Head from "next/head";
import { useRouter } from "next/router";

export default function NewPostPage() {
  const router = useRouter();
  const updateRouteWithId = (id) => {
    router.push(
      {
        pathname: "/posts/[id]",
        query: { id: id },
      },
      null,
      {
        shallow: true,
      }
    );
  };

  return (
    <>
      <Head>
        <title>New Post</title>
      </Head>
      <div>dummy</div>
      {/* <EditPage /> */}
    </>
  );
}
