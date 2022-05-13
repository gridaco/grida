import Head from "next/head";
import { useRouter } from "next/router";
import { EditPage } from "@app/cms-posts/pages";

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
      {/* <EditPage /> */}
    </>
  );
}
