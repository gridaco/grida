"use client";

import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { TreeController } from "../controller";

const TreeContext = createContext<TreeController | null>(null);

export interface TreeProviderProps {
  controller: TreeController;
  children: ReactNode;
}

export function TreeProvider({ controller, children }: TreeProviderProps) {
  return (
    <TreeContext.Provider value={controller}>{children}</TreeContext.Provider>
  );
}

export function useTree<T = unknown>(): TreeController<T> {
  const ctx = useContext(TreeContext);
  if (!ctx) {
    throw new Error("useTree must be used inside a <TreeProvider>");
  }
  return ctx as TreeController<T>;
}

/**
 * Subscribe to a slice derived from the controller. Re-renders when the
 * selected value changes by reference (or by the supplied `equals`
 * function). Internally subscribes to every state channel (rows,
 * expanded, focus, drag, selection — not intent) and re-runs the selector
 * on each emit; performance is bounded by the cheap, version-keyed
 * memoization inside `getRows()` rather than by selector specificity.
 */
export function useTreeSnapshot<T, R>(
  selector: (c: TreeController<T>) => R,
  equals: (a: R, b: R) => boolean = Object.is
): R {
  const controller = useTree<T>();
  const last_ref = useRef<{ has: boolean; value: R }>({
    has: false,
    value: undefined as unknown as R,
  });
  const server_ref = useRef<{ has: boolean; value: R }>({
    has: false,
    value: undefined as unknown as R,
  });
  const read = () => {
    const next = selector(controller);
    if (!last_ref.current.has || !equals(last_ref.current.value, next)) {
      last_ref.current = { has: true, value: next };
    }
    return last_ref.current.value;
  };
  return useSyncExternalStore(
    (cb) => controller.subscribeAny(cb),
    read,
    // Server snapshot must be stable across calls — useSyncExternalStore
    // complains otherwise and React falls into an update loop.
    () => {
      if (!server_ref.current.has) {
        server_ref.current = { has: true, value: selector(controller) };
      }
      return server_ref.current.value;
    }
  );
}
