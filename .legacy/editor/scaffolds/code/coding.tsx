import React, { useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { File } from "core/states";
import { debounce } from "utils/debounce";
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
  const file = useCurrentFile<File>();
  const dispatch = useDispatch();
  const [codingState, codingDispatch] = React.useReducer(reducer, {
    focus: null,
    placements: [],
  });

  useEffect(() => {
    if (file) {
      codingDispatch({ type: "focus", path: file.path });
    }
  }, [file?.path]);

  const onChangeHandler = useCallback(
    debounce((code: string, e) => {
      dispatch({
        type: "codeing/update-file",
        key: file.path,
        content: code,
      });
    }, 500),
    [file?.path]
  );

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
              path={file.path}
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
