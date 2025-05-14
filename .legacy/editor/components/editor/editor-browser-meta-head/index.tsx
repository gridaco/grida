import React from "react";
import Head from "next/head";
import { useEditorState } from "core/states";

export function EditorBrowserMetaHead({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();

  return (
    <>
      <Head>
        <title>
          {state?.design?.name
            ? `Grida | ${state?.design?.name}`
            : "Grida Code"}
        </title>
      </Head>
      {children}
    </>
  );
}
