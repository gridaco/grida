import React, { useCallback, useEffect, useRef, useState } from "react";
import styled from "@emotion/styled";
import { designToCode, Result } from "@designto/code";
import { config } from "@grida/builder-config";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { File, useEditorState, useWorkspaceState } from "core/states";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import { useTargetContainer } from "hooks/use-target-node";
import { debounce } from "utils/debounce";
import { supportsScripting } from "config";
import { useFigmaImageService } from "scaffolds/editor";
import { MonacoEditor } from "components/code-editor";
import { CodingToolbar } from "./codeing-toolbar";
import { useCurrentFile } from "./hooks";
import { useDispatch } from "core/dispatch";

interface CodingState {
  /**
   * current interactive file
   */
  focus: string;
  /**
   * list of files (paths) that are currently opened in the tab bar.
   */
  placements: string[];
}

type CodingAction = CloseFileTabAction | PlaceFileAction | FocusFileAction;
type CloseFileTabAction = {
  type: "close";
  path: string;
};
type PlaceFileAction = { type: "place"; path: string };
type FocusFileAction = { type: "focus"; path: string };

const CodingStateContext = React.createContext<CodingState | null>(null);

export function useCodingState() {
  const state = React.useContext(CodingStateContext);
  if (!state) {
    throw new Error("useCodingState must be used within a CodingProvider");
  }
  return state;
}

type FlatDispatcher = (action: CodingAction) => void;

const __noop = () => {};

function reducer(state: CodingState, action: CodingAction): CodingState {
  switch (action.type) {
    case "close": {
      const placements = state.placements.filter((p) => p !== action.path); // it's like removing
      const focus = placements[0] || null;
      return {
        ...state,
        placements,
        focus,
      };
    }
    case "place": {
      const placements = state.placements.includes(action.type)
        ? state.placements
        : [...state.placements, action.path];
      const focus = action.path;
      return {
        ...state,
        placements,
        focus,
      };
    }
    case "focus": {
      // do not modify the placements
      return {
        ...state,
        focus: action.path,
      };
    }
  }
}

const DispatchContext = React.createContext<FlatDispatcher>(__noop);

export const useCodingDispatch = (): FlatDispatcher => {
  const dispatch = React.useContext(DispatchContext);
  return useCallback(
    (action: CodingAction) => {
      dispatch(action);
    },
    [dispatch]
  );
};

export function Coding() {
  const wstate = useWorkspaceState();
  const file = useCurrentFile<File & { exports: string[] }>();
  const dispatch = useDispatch();
  const { framework_config } = wstate.preferences;

  const [codingState, codingDispatch] = React.useReducer(reducer, {
    focus: null,
    placements: [],
  });

  useEffect(() => {
    if (file) {
      codingDispatch({ type: "focus", path: file.path });
    }
  }, [file?.path]);

  // const result = useCode();

  const onChangeHandler = debounce((code: string, e) => {
    // currently react and vanilla are supported
    if (supportsScripting(framework_config.framework)) {
      if (file.path === "/component.tsx") {
        dispatch({
          type: "codeing/update-file",
          framework: framework_config.framework,
          componentName: file.exports[0], // result.name,
          id: "tmp",
          raw: code,
        });
      }
    }
  }, 500);

  // const { code, scaffold, name: componentName, framework } = result ?? {};

  return (
    <CodingStateContext.Provider value={codingState}>
      <DispatchContext.Provider value={codingDispatch}>
        <CodeEditorContainer>
          <CodingToolbar />
          {file && codingState.focus ? (
            <MonacoEditor
              height="100vh"
              options={{
                automaticLayout: true,
                minimap: {
                  enabled: false,
                },
                guides: {
                  indentation: false,
                },
              }}
              onChange={onChangeHandler}
              value={file.content}
              language={file.type}
            />
          ) : (
            <EmptyState />
          )}
        </CodeEditorContainer>
      </DispatchContext.Provider>
    </CodingStateContext.Provider>
  );
}

const CodeEditorContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: hidden;
`;

function EmptyState() {
  return (
    <EmptyStateContainer>
      <EmptyStateText>Open a file and edit to preview results</EmptyStateText>
    </EmptyStateContainer>
  );
}

const EmptyStateContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  width: 100%;
`;

const EmptyStateText = styled.div`
  font-size: 14px;
  color: white;
  opacity: 0.5;
`;
