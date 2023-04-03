import React, { useEffect, useMemo, useState } from "react";
import Axios from "axios";
import Head from "next/head";
import { SigninToContinuePrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, SetupEditor } from "scaffolds/editor";
import { Workspace, useWorkspaceInitializerContext } from "scaffolds/workspace";
import { useRouter } from "next/router";

export default function FigmaCommunityFileEditorPage({
  id,
  file,
  name,
  description,
}: {
  id: string;
  file: any;
  name: any;
  description: any;
}) {
  const data = useMemo(() => JSON.parse(file), []);
  const router = useRouter();

  useEffect(() => {
    // initialize({
    //   ''
    // });
  }, []);

  return (
    <>
      <Head>
        <title>{name}</title>
        <meta name="description" content={description} />
      </Head>
      <SigninToContinuePrmoptProvider>
        <Workspace>
          <CachedFileSetup>
            <SetupEditor
              //
              key={id}
              filekey={id}
              nodeid={undefined}
              router={router}
            >
              <Editor />
            </SetupEditor>
          </CachedFileSetup>
        </Workspace>
      </SigninToContinuePrmoptProvider>
      <pre style={{ color: "white" }}>{JSON.stringify(data, null, 2)}</pre>;
    </>
  );
}

function CachedFileSetup({ children }: React.PropsWithChildren<{}>) {
  const { provideEditorSnapshot: initialize } =
    useWorkspaceInitializerContext();

  // TODO:
  return <>{children}</>;
}

export async function getServerSideProps(context) {
  const id = context.params.id;
  const s3_base = `https://figma-community-files.s3.us-west-1.amazonaws.com`;
  const s3_file = `${s3_base}/${id}/file.json`;
  const s3_meta = `${s3_base}/${id}/meta.json`;

  const { data: filedata } = await Axios.get(s3_file);
  const { data: metadata } = await Axios.get(s3_meta);

  return {
    props: {
      id,
      name: metadata.name,
      tags: metadata.tags,
      file: JSON.stringify(filedata),
    },
  };
}
