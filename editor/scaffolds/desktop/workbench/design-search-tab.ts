/**
 * Shared vocabulary for the `design_search` pick surface when it's hosted as a
 * dedicated editor-pane tab (vs the compact card the ai-sidebar pins above its
 * composer). A virtual tab has no backing file — its id is a reserved sentinel
 * the editor pane branches on, so it gets a "Pick references" label, an Images
 * icon, and no file context menu.
 *
 * Kept as a types-only leaf (no React, no heavy imports) so the agent pane,
 * the workbench, the editor pane, and the picker surface can all share the
 * session shape without importing each other.
 */

import type { ToolCallEntry } from "@/lib/agent-chat";
import type { PickReferencesHandler } from "@/kits/agent-chat";

/** The single virtual tab id. A real `relPath` is a bundle-relative file path
 *  and never carries a `://` scheme, so this can't collide with one. */
export const DESIGN_SEARCH_TAB_ID = "virtual://design-search";

/** True for any virtual (non-file) tab id. */
export function isVirtualTab(id: string): boolean {
  return id.startsWith("virtual://");
}

/**
 * The live pick the editor-pane surface needs, lifted out of the agent pane
 * (which owns the chat + `addToolResult`): the open `design_search` call and the
 * handler that resolves it. `busy` gates the surface's buttons while the session
 * is mid-turn — kept separate from `entry` so toggling it never resets the
 * surface's fetched results.
 */
export type DesignSearchSession = {
  entry: ToolCallEntry;
  onPick: PickReferencesHandler;
  busy: boolean;
};

/** The paused call's tool-call id (live camelCase or rehydrated snake_case). */
export function pickToolCallId(entry: ToolCallEntry): string {
  const e = entry as { toolCallId?: string; tool_call_id?: string };
  return e.toolCallId ?? e.tool_call_id ?? "";
}

/** The agent's proposed keyword for this pick. */
export function pickQuery(entry: ToolCallEntry): string {
  const input = ("input" in entry ? entry.input : undefined) as
    | { query?: unknown }
    | undefined;
  return typeof input?.query === "string" ? input.query : "";
}
