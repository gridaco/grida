import React, { useEffect, useCallback, useReducer } from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";
import { EditorSnapshot, StateProvider } from "core/states";
import { WorkspaceAction } from "core/actions";

import { P_DESIGN, useDesign, useDesignFile } from "hooks";
import {
  get_enable_components_config_from_query,
  get_framework_config_from_query,
  get_preview_runner_framework,
} from "query/to-code-options-from-query";

import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import { warmup } from "scaffolds/editor";

export default function Page() {
  const router = useRouter();

  // region global state
  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);
  // endregion global state

  const _design_param: string = router.query[P_DESIGN] as string;
  const _input = parseFileAndNodeId(_design_param);
  const design = useDesign({ type: "use-url", url: _design_param });

  useEffect(() => {
    // TODO: set preferences to workspace state.
    const framework_config = get_framework_config_from_query(router.query);
    const isDebug = router.query.debug;
    const preview_runner_framework = get_preview_runner_framework(router.query);
    const enable_components = get_enable_components_config_from_query(
      router.query
    );
  }, [router.query]);

  // background whole file fetching
  const file = useDesignFile({ file: _input?.file });
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
    if (_input?.node) {
      if (!design) {
        // if target design is specified, whole file fetching should wait until design is loaded.
        return;
      }
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
              key: _input.file,
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
  }, [_input?.url, design, file?.document?.children]);
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
