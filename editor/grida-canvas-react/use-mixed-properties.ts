import { useCallback, useMemo } from "react";
import { useCurrentEditor, useEditorState } from "./use-editor";
import grida from "@grida/schema";
import mixed, {
  type KeyIgnoreFn,
  type MixedProperties,
  type PropertyCompareFn,
} from "@grida/mixed-properties";
import type cg from "@grida/cg";

type WithId<T extends Record<string, any>> = T & { id: string };

/**
 * Mixed (multi-selection) properties hook (selector-first).
 *
 * Computes a "mixed" view over the given `ids` **only for the properties you select**.
 * Intended usage is per UI section (Text/Layout/Strokes/…), so sections can be chunked
 * without forcing unrelated mixed computations.
 *
 * - **Efficient**: subscribes only to the selected fields for the provided ids
 * - **Composable**: each section can call this independently
 *
 * Notes:
 * - `selector` must be pure (no side effects) and ideally stable (wrap with `useCallback`).
 * - The returned object matches `@grida/mixed-properties` output per key:
 *   `.value`, `.mixed`, `.partial`, `.ids`, `.values`.
 * - Use `options.isEqual` if you need tighter control over re-render behavior for large selections.
 */
export function useMixedProperties<T extends Record<string, any>>(
  ids: string[],
  selector: (node: grida.program.nodes.UnknownNode) => T,
  options?: {
    /**
     * Keys to ignore in the mixed analysis.
     *
     * Defaults to `["id"]`. If you include `"type"` or other keys in the selector,
     * you may also want to ignore them here.
     */
    ignoredKey?: (keyof WithId<T>)[] | KeyIgnoreFn<WithId<T>>;
    /**
     * Property compare function used by `@grida/mixed-properties` to detect unique values.
     * Defaults to deep equality.
     */
    compare?: PropertyCompareFn<WithId<T>>;
    /**
     * Equality function used by `useEditorState` selector subscription.
     * Defaults to deep equality (from `useEditorState`).
     *
     * You can provide a faster structural compare if your selector returns small, stable values.
     */
    isEqual?: (a: WithId<T>[], b: WithId<T>[]) => boolean;
  }
): MixedProperties<WithId<T>, typeof grida.mixed> {
  const instance = useCurrentEditor();

  const slice = useEditorState(
    instance,
    (state) =>
      ids.map((id) => {
        const node = state.document.nodes[
          id
        ] as grida.program.nodes.UnknownNode;
        return { ...selector(node), id } as WithId<T>;
      }),
    options?.isEqual
  );

  return useMemo(() => {
    return mixed<WithId<T>, typeof grida.mixed>(slice, {
      idKey: "id",
      ignoredKey: options?.ignoredKey ?? (["id"] as (keyof WithId<T>)[]),
      mixed: grida.mixed,
      compare: options?.compare,
    });
  }, [slice, options?.ignoredKey, options?.compare]);
}

/**
 * Query fill paints across the current selection and all descendants.
 *
 * Delegates to `editor.propertiesQuery` which dispatches to the active backend:
 * - **canvas (WASM)**: hash-based O(n) grouping in Rust
 * - **DOM**: JS-side traversal with deep-equality grouping
 *
 * Re-queries are suppressed during active gestures (translate, scale, rotate,
 * etc.) since those only affect geometry, not paints.
 */
export function useMixedPaints() {
  const instance = useCurrentEditor();

  // Subscribe to selection + gesture + document.
  // During an active gesture, `document` changes on every pointer move (transforms),
  // but paints are stable — so we freeze the document identity while gesturing.
  //
  // TODO: Replace gesture-based gating with fine-grained change tracking.
  // Editor should emit typed change events (e.g. "geometry" | "paint" | "style" | …)
  // so subscribers can react only to relevant mutations instead of inferring
  // staleness from gesture state. This would also cover non-gesture paint
  // changes (e.g. undo/redo, programmatic mutations) without the idle check.
  const slice = useEditorState(
    instance,
    (state) => ({
      selection: state.selection,
      gestureIdle: state.gesture.type === "idle",
      // Only track document identity when idle — during gestures, paints
      // can't change so we keep the stale reference to prevent re-queries.
      document: state.gesture.type === "idle" ? state.document : null,
    }),
    (a, b) =>
      a.gestureIdle === b.gestureIdle &&
      a.document === b.document &&
      a.selection.length === b.selection.length &&
      a.selection.every((id, i) => id === b.selection[i])
  );

  const { selection } = slice;

  const paints = useMemo(
    () =>
      instance.propertiesQuery.queryPaintGroups(selection, "fill", {
        recursive: true,
      }),
    [slice, instance]
  );

  // Collect all node IDs across groups for display-gating
  const ids = useMemo(() => {
    const set = new Set<string>();
    for (const group of paints) {
      for (const id of group.ids) {
        set.add(id);
      }
    }
    return Array.from(set);
  }, [paints]);

  const setPaint = useCallback(
    (
      index: number,
      value: grida.program.nodes.i.props.SolidPaintToken | cg.Paint | null
    ) => {
      const group = paints[index];
      const paintsArray = value === null ? [] : [value as cg.Paint];
      instance.commands.changeNodePropertyFills(group.ids, paintsArray);
    },
    [paints, instance.commands]
  );

  return useMemo(() => {
    return {
      selection,
      ids,
      paints,
      setPaint,
    };
  }, [selection, ids, paints, setPaint]);
}
