import { useCallback, useMemo } from "react";
import { editor } from "@/grida-canvas";
import { useCurrentEditor, useEditorState } from "./use-editor";
import { dq } from "@/grida-canvas/query";
import grida from "@grida/schema";
import mixed, {
  type KeyIgnoreFn,
  type MixedProperties,
  type PropertyCompareFn,
} from "@grida/mixed-properties";
import type cg from "@grida/cg";
import equal from "fast-deep-equal";

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
  selector: (node: grida.program.nodes.UnknwonNode) => T,
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
        ] as grida.program.nodes.UnknwonNode;
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
 * @deprecated expensive
 *
 * @todo This function is expensive because it resolves all paint values at once.
 * The UI only initially shows a partial set (n values). Optimize this by:
 * - First limiting by n and early exiting
 * - Adding a method to load all values on demand
 */
export function useMixedPaints() {
  const instance = useCurrentEditor();
  /**
   * Subscribe ONLY to:
   * - `selection`
   * - derived `ids` (selection + recursive children)
   * - active fill paints for those ids
   *
   * This avoids re-rendering on unrelated document mutations.
   */
  const slice = useEditorState(
    instance,
    (state) => {
      const selection = state.selection;

      // selection & its recursive children (stable insertion order)
      const idsSet = new Set<string>();
      for (const id of selection) {
        idsSet.add(id);
        for (const childId of dq.getChildren(state.document_ctx, id, true)) {
          idsSet.add(childId);
        }
      }
      const ids = Array.from(idsSet);

      const paintEntries: Array<{ nodeId: string; paint: cg.Paint }> = [];
      for (const nodeId of ids) {
        const node = state.document.nodes[
          nodeId
        ] as grida.program.nodes.UnknwonNode;
        if (!node) continue;

        const { paints } = editor.resolvePaints(node, "fill", 0);
        const activePaints = paints.filter((p) => p?.active !== false);
        for (const paint of activePaints) {
          paintEntries.push({ nodeId, paint });
        }
      }

      return { selection, ids, paintEntries };
    },
    equal
  );

  // TODO: @grida/mixed-properties should support array properties (e.g., fill_paints[] per node)
  // Once array handling is added to mixed(), replace this custom logic with normalized nodes + mixed()
  const paints = useMemo(() => {
    // Group by paint value (using deep equality)
    const paintGroups: Array<{ value: cg.Paint; ids: string[] }> = [];

    for (const { nodeId, paint } of slice.paintEntries) {
      // Find existing group with same paint value
      const existingGroup = paintGroups.find((group) =>
        equal(group.value, paint)
      );

      if (existingGroup) {
        if (!existingGroup.ids.includes(nodeId)) {
          existingGroup.ids.push(nodeId);
        }
      } else {
        paintGroups.push({ value: paint, ids: [nodeId] });
      }
    }

    return paintGroups;
  }, [slice.paintEntries]);

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
      selection: slice.selection,
      ids: slice.ids,
      paints,
      setPaint,
    };
  }, [slice.selection, slice.ids, paints, setPaint]);
}
