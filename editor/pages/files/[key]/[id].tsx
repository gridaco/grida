import React, { useEffect, useCallback, useReducer } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";
import { EditorSnapshot, StateProvider } from "core/states";
import { WorkspaceAction } from "core/actions";
import { useDesign, useDesignFile } from "hooks";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { warmup } from "scaffolds/editor";

export default function Page() {
  const router = useRouter();

  const { key, id } = router.query;
  const filekey = key as string;
  const nodeid = id as string;

  // region global state
  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);
  // endregion global state

  const design = useDesign({
    type: "use-file-node-id",
    file: filekey,
    node: nodeid,
  });

  // background whole file fetching
  const file = useDesignFile({ file: filekey });
  const prevstate =
    initialState.type == "success" && initialState.value.history.present;

  useEffect(() => {
    if (design) {
      if (initialState.type === "success") return;
      initialDispatcher({
        type: "set",
        value: warmup.initializeDesign(design),
      });
    }
  }, [design, router.query]);

  useEffect(() => {
    if (!design) {
      // if target design is specified, whole file fetching should wait until design is loaded.
      return;
    }

    if (file) {
      let val: EditorSnapshot;

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
          val = {
            selectedNodes: [],
            selectedLayersOnPreview: [],
            design: {
              input: null,
              key: filekey,
              pages: pages,
              components: components,
            },
            selectedPage: warmup.selectedPage(prevstate, pages, null),
          };
        }
      }

      initialDispatcher({
        type: "set",
        value: val,
      });
    }
  }, [router.query, design, file?.document?.children]);
  // endregion

  const safe_value = warmup.safestate(initialState);

  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={safe_value} dispatch={handleDispatch}>
        <Editor />
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
  );
}
