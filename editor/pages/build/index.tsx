import React from "react";
import { Editor, SetupNoopEditor } from "scaffolds/editor";
import { Workspace } from "scaffolds/workspace/workspace";
import { BuilderProviders } from "scaffolds/editor";

export default function BuilderEditor() {
  return (
    <>
      <Workspace
        designer="builder"
        initial={{
          editor: {
            mode: "craft",
          },
        }}
      >
        <SetupNoopEditor>
          <BuilderProviders>
            <Editor />
            {/* <CanvasInteractive /> */}
          </BuilderProviders>
        </SetupNoopEditor>
      </Workspace>
    </>
  );
}
