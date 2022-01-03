import React, { useEffect, useCallback, useReducer } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor, EditorDefaultProviders } from "scaffolds/editor";
import { EditorSnapshot, StateProvider } from "core/states";
import { WorkspaceAction } from "core/actions";
import { useDesignFile } from "hooks";

import { warmup } from "scaffolds/editor";

export default function FileEntryEditor() {
  const router = useRouter();
  const { key } = router.query;
  const filekey = key as string;

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
    if (file) {
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
    }
  }, [filekey, file?.document?.children]);

  const safe_value = warmup.safestate(initialState);
  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={safe_value} dispatch={handleDispatch}>
        <EditorDefaultProviders>
          <Editor />
        </EditorDefaultProviders>
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
  );
}
