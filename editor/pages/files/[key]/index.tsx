import React, { useEffect, useCallback, useReducer, useState } from "react";
import { useRouter, NextRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, EditorDefaultProviders } from "scaffolds/editor";
import { EditorSnapshot, StateProvider } from "core/states";
import { WorkspaceAction } from "core/actions";
import { useDesignFile, TUseDesignFile } from "hooks";
import { warmup } from "scaffolds/editor";
import { EditorBrowserMetaHead } from "components/editor";
import type { FileResponse } from "@design-sdk/figma-remote-types";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key } = router.query;

  const [nodeid, setNodeid] = useState<string>();
  const filekey = key as string;
  // const nodeid = node as string;

  // background whole file fetching
  const file = useDesignFile({ file: filekey });

  useEffect(() => {
    if (!router.isReady) return;

    if (!nodeid) {
      // set nodeid only first time
      setNodeid(router.query.node as string);
      console.log("nodeid set", router.query.node);
    }
  }, [router.isReady]);

  return (
    <SigninToContinueBannerPrmoptProvider>
      <SetupEditor
        key={filekey}
        file={file}
        filekey={filekey}
        nodeid={nodeid}
        router={router}
      />
    </SigninToContinueBannerPrmoptProvider>
  );
}

const action_fetchfile_id = "fetchfile";

function SetupEditor({
  filekey,
  nodeid,
  router,
  file,
}: {
  nodeid: string;
  filekey: string;
  router: NextRouter;
  file: TUseDesignFile;
}) {
  const [loading, setLoading] = useState<boolean>(true);

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);

  const initialCanvasMode = q_map_canvas_mode_from_query(
    router.query.mode as string
  ); // TODO: change this to reflect the nodeid input

  const initWith = (file: FileResponse) => {
    const prevstate =
      initialState.type == "success" && initialState.value.history.present;

    let val: EditorSnapshot;

    // TODO: seed this as well
    // ->> file.styles;

    const components = warmup.componentsFrom(file);
    const pages = warmup.pagesFrom(filekey, file);

    if (prevstate) {
      val = {
        ...prevstate,
        design: {
          ...prevstate.design,
          pages: pages,
        },
        selectedPage: warmup.selectedPage(
          prevstate,
          pages,
          prevstate.selectedNodes
        ),
      };
    } else {
      const initialSelections =
        // set selected nodes initially only if the nodeid is the id of non-page node
        pages.some((p) => p.id === nodeid) ? [] : nodeid ? [nodeid] : [];

      val = {
        selectedNodes: initialSelections,
        selectedNodesInitial: initialSelections,
        selectedPage: warmup.selectedPage(prevstate, pages, nodeid && [nodeid]),
        selectedLayersOnPreview: [],
        design: {
          name: file.name,
          input: null,
          components: components,
          // styles: null,
          key: filekey,
          pages: pages,
        },
        canvasMode: initialCanvasMode,
        editorTaskQueue: {
          isBusy: true,
          tasks: [
            {
              id: action_fetchfile_id,
              name: "Figma File",
              description: "Refreshing remote file",
              progress: null,
            },
          ],
        },
      };
    }

    initialDispatcher({
      type: "set",
      value: val,
    });
  };

  useEffect(() => {
    if (!loading) {
      return;
    }

    if (file.__type === "loading") {
      return;
    }

    if (file.__type === "error") {
      // handle error by reason
      switch (file.reason) {
        case "unauthorized":
        case "no-auth": {
          if (file.cached) {
            initWith(file.cached);
            setLoading(false);
            alert(
              "You will now see the cached version of this file. To view the latest version, setup your personall access token."
            );
            // TODO: show signin prompt
            window.open("/preferences/access-tokens", "_blank");
          } else {
            router.push("/preferences/access-tokens");
          }
          break;
        }
        case "no-file": {
          // ignore. might still be fetching file from query param.
          break;
        }
      }
      return;
    }

    if (!file.__initial) {
      // when full file is loaded, allow editor with user interaction.
      setLoading(false);
    }

    initWith(file);
  }, [
    filekey,
    file,
    file.__type == "file-fetched-for-app" ? file.document?.children : null,
  ]);

  const safe_value = warmup.safestate(initialState);

  return (
    <StateProvider state={safe_value} dispatch={handleDispatch}>
      <EditorDefaultProviders>
        <EditorBrowserMetaHead>
          <Editor loading={loading} />
        </EditorBrowserMetaHead>
      </EditorDefaultProviders>
    </StateProvider>
  );
}

/**
 * TODO: support single design fetching
  // if target node is provided from query, use it.
  const design = useDesign({
    type: "use-file-node-id",
    file: filekey,
    node: nodeid,
  });


  useEffect(() => {
    if (!loading) {
      // if already loaded, ignore target node change.
      return;
    }
    if (design) {
      if (initialState.type === "success") return;
      initialDispatcher({
        type: "set",
        value: warmup.initializeDesign(design),
      });
    }
  }, [design, router.query, loading]);

  // under main hook
  if (design) {
    const initialState = warmup.initializeDesign(design);
    val = {
      ...initialState,
      design: {
        ...initialState.design,
        pages: pages,
      },
      selectedPage: warmup.selectedPage(
        prevstate,
        pages,
        initialState.selectedNodes
      ),
    };
  } else {
    
  }
 */

const q_map_canvas_mode_from_query = (
  mode: string
): EditorSnapshot["canvasMode"] => {
  switch (mode) {
    case "free":
    case "isolated-view":
    case "fullscreen-preview":
      return mode;

    // -------------------------
    // legacy query param key
    case "full":
      return "free";
    case "isolate":
      return "isolated-view";
    // -------------------------

    default:
      return "free";
  }
};
