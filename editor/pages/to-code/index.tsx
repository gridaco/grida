import React, { useEffect, useCallback, useReducer } from "react";
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
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import { TargetNodeConfig } from "query/target-node";

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

  const selectedPage = (pages: { id: string }[], selectedNodes: string[]) => {
    if (prevstate.selectedPage) {
      return prevstate.selectedPage;
    }

    if (selectedNodes && pages) {
      return selectedNodes.length > 0
        ? pages.find((page) => {
            return isChildrenOf(selectedNodes[0], page);
          })?.id ?? null
        : // find page of current selection.
          null;
    }

    return file?.document?.children?.[0].id ?? null; // otherwise, return first page.
  };

  function initializeDesign(design: TargetNodeConfig): EditorSnapshot {
    return {
      selectedNodes: [design.node],
      selectedLayersOnPreview: [],
      selectedPage: null,
      design: {
        pages: [],
        key: design.file,
        input: DesignInput.fromApiResponse({
          ...design,
          entry: design.reflect,
        }),
      },
    };
  }

  useEffect(() => {
    if (design) {
      if (initialState.type === "success") return;
      initialDispatcher({
        type: "set",
        value: initializeDesign(design),
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
          selectedPage: selectedPage(pages, prevstate.selectedNodes),
        };
      } else {
        if (design) {
          const initialState = initializeDesign(design);
          val = {
            ...initialState,
            design: {
              ...initialState.design,
              pages: pages,
            },
            selectedPage: selectedPage(pages, initialState.selectedNodes),
          };
        } else {
          val = {
            selectedNodes: [],
            selectedLayersOnPreview: [],
            design: {
              input: null,
              key: _input.file,
              pages: pages,
            },
            selectedPage: selectedPage(pages, null),
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
  if (!parent) return false;
  if (child === parent.id) return true;
  if (parent.children?.length === 0) return false;
  return parent.children?.some((c) => isChildrenOf(child, c)) ?? false;
}
