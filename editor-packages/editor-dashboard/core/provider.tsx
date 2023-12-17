import React, {
  createContext,
  useCallback,
  useContext,
  memo,
  ReactNode,
  useReducer,
  useMemo,
} from "react";
import type { DashboardState } from "./state";
import type { Action } from "./action";
import { reducer } from "./reducer";
import { initialDashboardState } from "./initial";
import { FigmaReflectRepository, useEditorState } from "editor/core/states";
import { useDispatch as useEditorDispatch } from "editor/core/dispatch";
const __noop = () => {};

type Dispatcher = (action: Action) => void;

const DispatchContext = createContext<Dispatcher>(__noop);

const useDispatch = (): Dispatcher => {
  const dispatch = useContext(DispatchContext);
  return useCallback(
    (action: Action) => {
      dispatch(action);
    },
    [dispatch]
  );
};

const StateContext = createContext<DashboardState | undefined>(undefined);

export const DashboardStateProvider = function Awaiter({
  children,
  design,
}: React.PropsWithChildren<{ design?: FigmaReflectRepository }>) {
  if (!design) {
    return <>{children}</>;
  }

  return <_Provider design={design}>{children}</_Provider>;
};

const _Provider = function StateProvider({
  children,
  design,
}: React.PropsWithChildren<{
  design: FigmaReflectRepository;
}>) {
  const [value, dispatch] = useReducer(
    reducer,
    design ? initialDashboardState(design) : undefined
  );

  return (
    <StateContext.Provider value={value}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
};

export function useDashboardState(): [DashboardState, Dispatcher] {
  const state = useContext(StateContext);
  const dispatch = useDispatch();
  return useMemo(() => [state, dispatch], [state, dispatch]);
}

export function useDashboard() {
  const [editorState] = useEditorState();
  const editordispatch = useEditorDispatch();
  const [state, dispatch] = useDashboardState();

  const selectNode = useCallback(
    (node: string | string[]) => {
      editordispatch({
        type: "select-node",
        node,
      });
    },
    [editordispatch]
  );

  const isolateNode = useCallback(
    (node: string) => {
      editordispatch({
        type: "design/enter-isolation",
        node,
      });
    },
    [editordispatch]
  );

  const focusNodeOnCanvas = useCallback(
    (node: string) => {
      editordispatch({
        type: "canvas/focus",
        node,
      });
      editordispatch({
        type: "mode",
        mode: "design",
      });
    },
    [editordispatch]
  );

  const blurSelection = useCallback(() => {
    editordispatch({
      type: "select-node",
      node: null,
    });
  }, [editordispatch]);

  const foldAll = useCallback(() => {
    dispatch({
      type: "fsv/fold-all",
    });
  }, [dispatch]);

  const unfoldAll = useCallback(() => {
    dispatch({
      type: "fsv/unfold-all",
    });
  }, [dispatch]);

  const fold = useCallback(
    (path: string) => {
      dispatch({
        type: "fsv/fold",
        path,
      });
    },
    [dispatch]
  );

  const unfold = useCallback(
    (path: string) => {
      dispatch({
        type: "fsv/unfold",
        path,
      });
    },
    [dispatch]
  );

  const mkdir = useCallback(
    (cwd: string, name?: string) => {
      dispatch({
        type: "fsv/mkdir",
        cwd,
        name,
      });
    },
    [dispatch]
  );

  const mv = useCallback(
    (src: string[], dst: string) => {
      dispatch({
        type: "fsv/mv",
        source: src,
        dest: dst,
      });
    },
    [dispatch]
  );

  return {
    ...state,
    selection: editorState.selectedNodes,
    dispatch,
    selectNode,
    focusNodeOnCanvas,
    isolateNode,
    blurSelection,
    foldAll,
    unfoldAll,
    fold,
    unfold,
    mkdir,
    mv,
  };
}
