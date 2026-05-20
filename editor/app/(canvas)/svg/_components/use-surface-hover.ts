import { useCallback, useSyncExternalStore } from "react";
import { useSvgEditor } from "@grida/svg-editor/react";
import type { NodeId } from "@grida/svg-editor";

/**
 * Subscribe to the effective HUD surface hover.
 *
 * The editor exposes a transient hover channel that mirrors the HUD's
 * effective hover (pointer pick OR any host-set override) and fires when
 * either side changes. Out-of-canvas UI — the layers panel, breadcrumbs,
 * etc. — reads from here to mirror the canvas highlight.
 *
 * Cheap: the channel doesn't bump `state.version`, so this hook re-renders
 * the consuming component only when the hovered node id actually changes.
 *
 * `subscribe`/`get` are stabilized via `useCallback` so React doesn't
 * unsubscribe-then-resubscribe on every parent render — see FEEDBACK.md §3.
 */
export function useSurfaceHover(): NodeId | null {
  const editor = useSvgEditor();
  const subscribe = useCallback(
    (cb: () => void) => editor.subscribe_surface_hover(cb),
    [editor]
  );
  const get = useCallback(() => editor.surface_hover(), [editor]);
  return useSyncExternalStore<NodeId | null>(subscribe, get, () => null);
}
