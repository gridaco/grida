import React from "react";
import Head from "next/head";
import { useEditorState } from "core/states";

export function EditorBrowserMetaHead({
  children,
}: {
  children: React.ReactChild;
}) {
  const [state] = useEditorState();

  return (
    <>
      <Head>
        <title>
          {state?.design?.name ? `Grida | ${state?.design?.name}` : "Loading.."}
        </title>
      </Head>
      {children}
    </>
  );
}
