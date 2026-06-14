/**
 * Workspace external-change fan-out (issue #805).
 *
 * One `workspaces.subscribe_changes` subscription per open workspace,
 * shared by every consumer in the workbench — the file tree (surgical
 * refresh of the affected parent) and each open editor pane (reload when
 * clean / defer to the save-time conflict guard when dirty).
 *
 * A workbench-scoped context rather than prop-drilling through
 * `EditorPane` + the tab stack: the consumers are scattered (the tree and
 * each mounted pane) and all want the same stream. The subscription lives
 * in the provider; consumers attach via {@link useWorkspaceChanges}, which
 * holds the handler in a ref so it can be an inline closure without
 * re-subscribing.
 *
 * No-op on desktop binaries without the watcher capability (and entirely
 * on the web bridge): the provider simply never starts a subscription, so
 * consumers fall back to the existing pull/manual refresh.
 */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import {
  workspaces as workspacesNs,
  type WorkspaceChangeEvent,
} from "@/lib/desktop/bridge";

type ChangeListener = (events: WorkspaceChangeEvent[]) => void;
type Subscribe = (listener: ChangeListener) => () => void;

const WorkspaceChangesContext = createContext<Subscribe | null>(null);

export function WorkspaceChangesProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const listenersRef = useRef<Set<ChangeListener>>(new Set());

  const subscribe = useCallback<Subscribe>((listener) => {
    const listeners = listenersRef.current;
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!workspacesNs.isWatchSupported()) return;
    let cancelled = false;
    let subscriptionId: string | null = null;
    workspacesNs
      .subscribeChanges(workspaceId, (events) => {
        // Snapshot (Array.from, not live iteration) so a listener
        // attaching/detaching mid-dispatch can't mutate the set we're
        // iterating.
        for (const listener of Array.from(listenersRef.current)) {
          listener(events);
        }
      })
      .then((handle) => {
        subscriptionId = handle.subscriptionId;
        // The effect cleaned up before the async subscribe resolved.
        if (cancelled) void workspacesNs.unsubscribeChanges(subscriptionId);
      })
      .catch(() => {
        // Watch couldn't start (old binary / host error) — consumers stay
        // on pull-refresh; nothing else to do.
      });
    return () => {
      cancelled = true;
      if (subscriptionId) void workspacesNs.unsubscribeChanges(subscriptionId);
    };
  }, [workspaceId]);

  return (
    <WorkspaceChangesContext.Provider value={subscribe}>
      {children}
    </WorkspaceChangesContext.Provider>
  );
}

/**
 * Attach a handler for coalesced external file-change batches under the
 * workspace. No-op when the provider is absent or the binary lacks the
 * watcher. `onChanges` is held in a ref, so an inline closure is fine and
 * never causes a re-subscribe.
 */
export function useWorkspaceChanges(onChanges: ChangeListener): void {
  const subscribe = useContext(WorkspaceChangesContext);
  const ref = useRef(onChanges);
  ref.current = onChanges;
  useEffect(() => {
    if (!subscribe) return;
    return subscribe((events) => ref.current(events));
  }, [subscribe]);
}
