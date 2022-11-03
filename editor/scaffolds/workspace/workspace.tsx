import React, {
  useCallback,
  useReducer,
  useContext,
  createContext,
} from "react";
import { useRouter } from "next/router";
import { StateProvider } from "core/states";
import { SetupWorkspace } from "./setup";
import * as warmup from "./warmup";
import type { EditorSnapshot } from "core/states";
import type { WorkspaceAction, WorkspaceWarmupAction } from "core/actions";

const WorkspaceInitializerContext =
  createContext<{
    provideEditorSnapshot: (snapshot: EditorSnapshot) => void;
  }>(null);

export function useWorkspaceInitializerContext() {
  return useContext(WorkspaceInitializerContext);
}

export function Workspace({ children }: React.PropsWithChildren<{}>) {
  const router = useRouter();

  const handleDispatch = useCallback((action: WorkspaceAction) => {
    initialDispatcher({ type: "update", value: action });
  }, []);

  const handleWarmup = useCallback((action: WorkspaceWarmupAction) => {
    initialDispatcher({ type: "warmup", value: action });
  }, []);

  const handleProvideEditorSnapshot = useCallback(
    (snapshot: EditorSnapshot) => {
      initialDispatcher({
        type: "setup-with-editor-snapshot",
        value: snapshot,
      });
    },
    []
  );

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const safe_value = warmup.safestate(initialState);

  return (
    <>
      <WorkspaceInitializerContext.Provider
        value={{
          provideEditorSnapshot: handleProvideEditorSnapshot,
        }}
      >
        <StateProvider state={safe_value} dispatch={handleDispatch}>
          <SetupWorkspace router={router} dispatch={handleWarmup}>
            {children}
          </SetupWorkspace>
        </StateProvider>
      </WorkspaceInitializerContext.Provider>
    </>
  );
}
