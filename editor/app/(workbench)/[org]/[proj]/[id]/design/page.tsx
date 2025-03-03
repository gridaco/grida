"use client";

import React, { useCallback } from "react";
import { AgentThemeProvider } from "@/scaffolds/agent/theme";
import { useEditorState } from "@/scaffolds/editor";
import { SideControl } from "@/scaffolds/sidecontrol";
import FormCollectionPage from "@/theme/templates/formcollection/page";
import { CanvasFloatingToolbar } from "@/scaffolds/canvas-floating-toolbar";
import {
  StandaloneDocumentEditor,
  ViewportRoot,
  EditorSurface,
  StandaloneDocumentContent,
} from "@/grida-react-canvas";
import { composeEditorDocumentAction } from "@/scaffolds/editor/action";
import { CanvasAction } from "@/grida-react-canvas";
import { AutoInitialFitTransformer } from "@/grida-react-canvas/renderer";
import queryattributes from "@/grida-react-canvas/nodes/utils/attributes";
import _002 from "@/theme/templates/formstart/002/page";
import { EditorSurfaceContextMenu } from "@/grida-react-canvas/viewport/surface-context-menu";

export default function SiteDeisngPage() {
  return (
    <main className="h-full flex flex-1 w-full">
      <CurrentPageCanvas />
    </main>
  );
}

function CurrentPageCanvas() {
  const [state, dispatch] = useEditorState();

  const {
    theme: { lang },
    selected_page_id,
    documents,
  } = state;

  // @ts-ignore
  const document = documents[selected_page_id!];

  const documentDispatch = useCallback(
    (action: CanvasAction) => {
      dispatch(
        composeEditorDocumentAction(
          // @ts-ignore
          selected_page_id!,
          action
        )
      );
    },
    [selected_page_id, dispatch]
  );

  switch (selected_page_id) {
    case "site/dev-collection":
      return (
        <StandaloneDocumentEditor
          editable
          initial={document}
          dispatch={documentDispatch}
        >
          {/*  */}
          <div className="flex w-full h-full">
            <EditorSurfaceContextMenu>
              <ViewportRoot className="relative w-full h-full overflow-hidden">
                <EditorSurface />
                <AutoInitialFitTransformer>
                  <StandaloneDocumentContent
                    templates={{
                      "002": CustomComponent,
                    }}
                  />
                </AutoInitialFitTransformer>
              </ViewportRoot>
            </EditorSurfaceContextMenu>
          </div>
        </StandaloneDocumentEditor>
      );

    default:
      return <>UNKNOWN PAGE {selected_page_id}</>;
  }
}

function CustomComponent(props: any) {
  return (
    <div
      className="rounded shadow border"
      style={{
        width: 375,
        height: 812,
      }}
      {...queryattributes(props)}
    >
      <_002 />
    </div>
  );
}
