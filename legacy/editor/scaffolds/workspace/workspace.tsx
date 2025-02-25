import React, {
  useCallback,
  useReducer,
  useContext,
  createContext,
} from "react";
import { useRouter } from "next/router";
import { WorkspaceStateSeed, StateProvider } from "core/states";
import { SetupFigmaWorkspace } from "./setup";
import { WorkspaceDefaultProviders } from "./_providers";
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

export function Workspace({
  children,
  initial,
  designer,
}: React.PropsWithChildren<{
  initial?: WorkspaceStateSeed;
  designer: "figma" | "builder";
}>) {
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
        seed: initial,
      });
    },
    []
  );

  const [initialState, initialDispatcher] = useReducer(warmup.initialReducer, {
    type: "pending",
  });

  const safe_value = warmup.safestate(initialState, initial);

  return (
    <>
      <WorkspaceInitializerContext.Provider
        value={{
          provideEditorSnapshot: handleProvideEditorSnapshot,
        }}
      >
        <StateProvider state={safe_value} dispatch={handleDispatch}>
          <WorkspaceDefaultProviders>
            {designer === "figma" ? (
              <SetupFigmaWorkspace router={router} dispatch={handleWarmup}>
                {children}
              </SetupFigmaWorkspace>
            ) : (
              <>{children}</>
            )}
          </WorkspaceDefaultProviders>
        </StateProvider>
      </WorkspaceInitializerContext.Provider>
    </>
  );
}
