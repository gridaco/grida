"use client";

import {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type Context,
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
  return useTreeSnapshotWithController<T, R>(controller, selector, equals);
}

/**
 * Internal helper shared by the un-typed `useTreeSnapshot` and the
 * typed-context factory below. Identical semantics; the only difference
 * is where the controller is resolved from.
 */
function useTreeSnapshotWithController<T, R>(
  controller: TreeController<T>,
  selector: (c: TreeController<T>) => R,
  equals: (a: R, b: R) => boolean = Object.is
): R {
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

export interface TreeContext<TMeta> {
  /** Provider scoped to this typed context. */
  TreeProvider: (props: {
    controller: TreeController<TMeta>;
    children: ReactNode;
  }) => ReactNode;
  /** Returns the `TreeController<TMeta>` from the nearest matching provider. */
  useTree: () => TreeController<TMeta>;
  /** Selector-subscribed snapshot, with `TMeta` preserved through the selector. */
  useTreeSnapshot: <R>(
    selector: (c: TreeController<TMeta>) => R,
    equals?: (a: R, b: R) => boolean
  ) => R;
  /**
   * The underlying React context. Exposed so consumers can compose this
   * factory with other context-aware utilities (e.g. read the controller
   * inside a `<Suspense>` boundary, custom dev-tools). Most apps never
   * need this.
   */
  Context: Context<TreeController<TMeta> | null>;
}

/**
 * Create a typed React context for a `TreeController<TMeta>`. Returns its
 * own provider + hook trio so `useTree()` / `useTreeSnapshot()` preserve
 * `TMeta` end-to-end — no `as` casts at the call site.
 *
 * The un-typed exports (`TreeProvider`, `useTree`, `useTreeSnapshot`)
 * stay available for the lite/quickstart path and standalone demos; this
 * factory is the recommended path for typed applications where the meta
 * shape is known up-front.
 *
 * ```ts
 * const { TreeProvider, useTree, useTreeSnapshot } =
 *   createTreeContext<SvgNodeMeta>();
 *
 * // TreeProvider, useTree, useTreeSnapshot now carry SvgNodeMeta.
 * ```
 *
 * Notes:
 * - Each call creates a fresh, independent React context. Two factories
 *   do not share state.
 * - The typed and un-typed providers are independent — a `useTree()` from
 *   the un-typed surface will not find a controller mounted under a
 *   factory-typed provider, and vice versa. Pick one per tree.
 * - Zero runtime cost beyond a `createContext` call; everything else is
 *   the same code path as the un-typed surface.
 */
export function createTreeContext<TMeta>(): TreeContext<TMeta> {
  const Ctx = createContext<TreeController<TMeta> | null>(null);

  function TreeProviderTyped({
    controller,
    children,
  }: {
    controller: TreeController<TMeta>;
    children: ReactNode;
  }) {
    return <Ctx.Provider value={controller}>{children}</Ctx.Provider>;
  }

  function useTreeTyped(): TreeController<TMeta> {
    const ctx = useContext(Ctx);
    if (!ctx) {
      throw new Error(
        "useTree must be used inside a <TreeProvider> from createTreeContext"
      );
    }
    return ctx;
  }

  function useTreeSnapshotTyped<R>(
    selector: (c: TreeController<TMeta>) => R,
    equals: (a: R, b: R) => boolean = Object.is
  ): R {
    const controller = useTreeTyped();
    return useTreeSnapshotWithController<TMeta, R>(
      controller,
      selector,
      equals
    );
  }

  return {
    TreeProvider: TreeProviderTyped,
    useTree: useTreeTyped,
    useTreeSnapshot: useTreeSnapshotTyped,
    Context: Ctx,
  };
}
