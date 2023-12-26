import React from "react";
import { useRouter } from "next/router";
import { SigninToContinuePrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, SetupFigmaFileEditor } from "scaffolds/editor";
import { Workspace } from "scaffolds/workspace/workspace";
import { EditorDefaultProviders } from "scaffolds/editor";
import { EditorBrowserMetaHead } from "components/editor";
import { Dialog } from "@mui/material";

export default function BuilderEditor() {
  const router = useRouter();
  const { key } = router.query;

  const filekey = key as string;

  return (
    <>
      <ReadmeModal />
      <SigninToContinuePrmoptProvider>
        <Workspace
          initial={{
            editor_mode: "craft",
          }}
        >
          <SetupFigmaFileEditor
            key={filekey}
            filekey={filekey}
            nodeid={undefined}
            router={router}
          >
            <EditorDefaultProviders>
              <EditorBrowserMetaHead>
                <Editor />
              </EditorBrowserMetaHead>
            </EditorDefaultProviders>
          </SetupFigmaFileEditor>
        </Workspace>
      </SigninToContinuePrmoptProvider>
    </>
  );
}

function ReadmeModal() {
  const [open, setOpen] = React.useState(true);
  return (
    <Dialog
      open={open}
      onClose={() => {
        setOpen(false);
      }}
    >
      <div className="container bg-black mx-auto p-4">
        <h1>Readme</h1>
        <p>
          This is a prototype of a figma plugin that allows you to create a
          website from your figma file.
        </p>
        <p>
          The plugin is not yet ready for production use. It is a prototype to
          test the idea.
        </p>
      </div>
    </Dialog>
  );
}
