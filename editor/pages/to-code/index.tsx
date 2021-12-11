import React, {
  useEffect,
  useState,
  useCallback,
  useReducer,
  useMemo,
} from "react";
import { useRouter } from "next/router";
import { SigninToContinueBannerPrmoptProvider } from "components/prompt-banner-signin-to-continue";
import { Editor } from "scaffolds/editor";
import {
  createPendingWorkspaceState,
  EditorSnapshot,
  StateProvider,
  WorkspaceState,
} from "core/states";
import { WorkspaceAction } from "core/actions";
import { createInitialWorkspaceState } from "core/states";
import { workspaceReducer } from "core/reducers";
import { P_DESIGN, useDesign, useDesignFile } from "hooks";
import {
  get_enable_components_config_from_query,
  get_framework_config_from_query,
  get_preview_runner_framework,
} from "query/to-code-options-from-query";
import { PendingState } from "core/utility-types";
import { DesignInput } from "@designto/config/input";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { analyze, parseFileAndNodeId } from "@design-sdk/figma-url";

const pending_workspace_state = createPendingWorkspaceState();
//
type InitializationAction =
  | { type: "set"; value: EditorSnapshot }
  | { type: "update"; value: WorkspaceAction };

function initialReducer(
  state: PendingState<WorkspaceState>,
  action: InitializationAction
): PendingState<WorkspaceState> {
  switch (action.type) {
    case "set":
      return {
        type: "success",
        value: createInitialWorkspaceState(action.value),
      };
    case "update":
      if (state.type === "success") {
        return {
          type: "success",
          value: workspaceReducer(state.value, action.value),
        };
      } else {
        return state;
      }
  }
}

export default function Page() {
  const router = useRouter();

  // region global state
  const [initialState, initialDispatcher] = useReducer(initialReducer, {
    type: "pending",
  });

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);
  // endregion global state

  const design = useDesign({ type: "use-router", router: router });

  useEffect(() => {
    if (initialState.type === "success") return;

    if (design) {
      // TODO: set preferences to workspace state.
      const framework_config = get_framework_config_from_query(router.query);
      const isDebug = router.query.debug;
      const preview_runner_framework = get_preview_runner_framework(
        router.query
      );
      const enable_components = get_enable_components_config_from_query(
        router.query
      );
      initialDispatcher({
        type: "set",
        value: {
          selectedNodes: [design.node],
          selectedLayersOnPreview: [],
          selectedPage: null, // TODO:
          design: {
            pages: [], // TODO:
            key: design.file,
            input: DesignInput.fromApiResponse({
              ...design,
              entry: design.reflect,
            }),
          },
        },
      });
    }
  }, [design, router]);

  // background whole file fetching
  const _design_param: string = router.query[P_DESIGN] as string;
  const _file_key = parseFileAndNodeId(_design_param)?.file;
  const file = useDesignFile({ file: _file_key });
  const prevstate =
    initialState.type == "success" && initialState.value.history.present;
  const selectedPage = useMemo(() => {
    if (prevstate.selectedPage) {
      return prevstate.selectedPage;
    }

    if (prevstate?.selectedNodes && file?.document?.children) {
      return prevstate.selectedNodes.length > 0
        ? file.document.children.find((page) => {
            return isChildrenOf(prevstate.selectedNodes[0], page);
          })?.id ?? null
        : // find page of current selection.
          null;
    }

    return file?.document?.children?.[0].id ?? null; // otherwise, return first page.
  }, [file?.document?.children]);

  useEffect(() => {
    if (file) {
      let val: EditorSnapshot;

      const pages = file.document.children.map((page) => ({
        id: page.id,
        name: page.name,
        children: page["children"]?.map((child) => {
          const _mapped = mapper.mapFigmaRemoteToFigma(child);
          return convert.intoReflectNode(_mapped);
        }),
        type: "design",
      }));
      if (prevstate) {
        val = {
          ...prevstate,
          design: {
            ...prevstate.design,
            pages: pages,
          },
          selectedPage: selectedPage,
        };
      } else {
        val = {
          selectedNodes: [],
          selectedLayersOnPreview: [],
          design: {
            input: null,
            key: _file_key,
            pages: pages,
          },
          selectedPage: selectedPage,
        };
      }

      initialDispatcher({
        type: "set",
        value: val,
      });
    }
  }, [file?.document?.children]);
  // endregion

  const safe_value =
    initialState.type === "success"
      ? initialState.value
      : pending_workspace_state;

  return (
    <SigninToContinueBannerPrmoptProvider>
      <StateProvider state={safe_value} dispatch={handleDispatch}>
        <Editor />
      </StateProvider>
    </SigninToContinueBannerPrmoptProvider>
  );
}

type Tree = {
  readonly id: string;
  readonly children?: ReadonlyArray<Tree>;
};

function isChildrenOf(child: string, parent: Tree) {
  if (child === parent.id) return true;
  if (parent.children?.length === 0) return false;
  return parent.children?.some((c) => isChildrenOf(child, c)) ?? false;
}
