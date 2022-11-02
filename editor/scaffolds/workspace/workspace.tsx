import { WorkspaceAction, WorkspaceWarmupAction } from "core/actions";
import { EditorSnapshot, StateProvider } from "core/states";
import { useRouter } from "next/router";
import React, { useCallback, useReducer } from "react";
import { warmup } from "scaffolds/editor";
import { SetupWorkspace } from "./setup";

const WorkspaceInitializerContext =
  React.createContext<{
    provideEditorSnapshot: (snapshot: EditorSnapshot) => void;
  }>(null);

export function useWorkspaceInitializerContext() {
  return React.useContext(WorkspaceInitializerContext);
}

export function Workspace({ children }: React.PropsWithChildren<{}>) {
  const router = useRouter();

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

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
