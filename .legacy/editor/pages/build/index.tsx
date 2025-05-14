import React, { useEffect } from "react";
import { Editor, SetupNoopEditor } from "scaffolds/editor";
import { Workspace } from "scaffolds/workspace/workspace";
import { CraftEditorProviders } from "scaffolds/editor";
import { useDispatch } from "core/dispatch";

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
          <CraftEditorProviders>
            <DeleteKeyProvider>
              <Editor />
            </DeleteKeyProvider>
          </CraftEditorProviders>
        </SetupNoopEditor>
      </Workspace>
    </>
  );
}

function DeleteKeyProvider({ children }: React.PropsWithChildren<{}>) {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        dispatch({
          type: "(craft)/node/delete",
        });
        dispatch({
          type: "highlight-node/remove",
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [dispatch]);

  return <>{children}</>;
}
