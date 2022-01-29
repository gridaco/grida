import React, { useEffect, useCallback, useReducer, useState } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, EditorDefaultProviders } from "scaffolds/editor";
import { EditorSnapshot, StateProvider } from "core/states";
import { WorkspaceAction } from "core/actions";
import { useDesign, useDesignFile } from "hooks";

import { warmup } from "scaffolds/editor";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key, node } = router.query;
  const filekey = key as string;
  const nodeid = node as string;

  const [loading, setLoading] = useState<boolean>(true);

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);

  // background whole file fetching
  const file = useDesignFile({ file: filekey });

  const prevstate =
    initialState.type == "success" && initialState.value.history.present;

  useEffect(() => {
    if (file.__type === "loading") {
      return;
    }

    if (file.__type === "error") {
      // handle error by reason
      switch (file.reason) {
        case "unauthorized":
        case "no-auth": {
          router.push("/preferences/access-tokens");
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

    let val: EditorSnapshot;

    // TODO: seed this as well
    // ->> file.styles;

    const components = warmup.componentsFrom(file);
    const pages = warmup.pagesFrom(file);

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
      val = {
        selectedNodes: [],
        selectedLayersOnPreview: [],
        design: {
          input: null,
          components: components,
          // styles: null,
          key: filekey,
          pages: pages,
        },
        selectedPage: warmup.selectedPage(prevstate, pages, null),
      };
    }

    initialDispatcher({
      type: "set",
      value: val,
    });
  }, [
    filekey,
    file,
    file.__type == "file-fetched-for-app" ? file.document?.children : null,
  ]);

  const safe_value = warmup.safestate(initialState);
  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={safe_value} dispatch={handleDispatch}>
        <EditorDefaultProviders>
          <Editor loading={loading} />
        </EditorDefaultProviders>
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
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
