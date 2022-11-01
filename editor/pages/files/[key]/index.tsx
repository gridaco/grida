import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { SetupEditor } from "scaffolds/editor";
import { useDesignFile } from "hooks";
import { SetupWorkspace } from "scaffolds/workspace";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key } = router.query;

  const [nodeid, setNodeid] = useState<string>();
  const filekey = key as string;

  // background whole file fetching
  const file = useDesignFile({ file: filekey });

  useEffect(() => {
    if (!router.isReady) return;

    if (!nodeid) {
      // set nodeid only first time
      setNodeid(router.query.node as string);
    }
  }, [router.isReady]);

  return (
    <SigninToContinueBannerPrmoptProvider>
      <SetupWorkspace router={router}>
        <SetupEditor
          key={filekey}
          file={file}
          filekey={filekey}
          nodeid={nodeid}
          router={router}
        />
      </SetupWorkspace>
    </SigninToContinueBannerPrmoptProvider>
  );
}
