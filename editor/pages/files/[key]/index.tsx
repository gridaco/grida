import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SigninToContinuePrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, SetupEditor } from "scaffolds/editor";
import { Workspace } from "scaffolds/workspace/workspace";
import { EditorDefaultProviders } from "scaffolds/editor";
import { EditorBrowserMetaHead } from "components/editor";

export default function FileEntryEditor() {
  const router = useRouter();
  const nodeid = useNodeID();
  const { key } = router.query;

  const filekey = key as string;

  return (
    <SigninToContinuePrmoptProvider>
      <Workspace>
        <SetupEditor
          key={filekey}
          filekey={filekey}
          nodeid={nodeid}
          router={router}
        >
          <EditorDefaultProviders>
            <EditorBrowserMetaHead>
              <Editor />
            </EditorBrowserMetaHead>
          </EditorDefaultProviders>
        </SetupEditor>
      </Workspace>
    </SigninToContinuePrmoptProvider>
  );
}

/**
 * use target node id from query params.
 */
function useNodeID() {
  const router = useRouter();
  const [nodeid, setNodeid] = useState<string>();
  useEffect(() => {
    if (!router.isReady) return;

    if (!nodeid) {
      // set nodeid only first time
      setNodeid(router.query.node as string);
    }
  }, [router.isReady]);
  return nodeid;
}
