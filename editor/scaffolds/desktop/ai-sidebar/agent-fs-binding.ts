/**
 * `bindEditor(editor)` — the `AgentFs.LiveBinding` that ties a single
 * virtual canvas path to a live `SvgEditor`.
 *
 * Mirrors `editor/app/(canvas)/svg/_ai/binding-svg.ts` (the web `/svg`
 * route's binding) shape-for-shape:
 *
 *   serialize → pretty-printed SVG (stable for the model's
 *               match-and-replace `edit_file`)
 *   load      → editor accepts any valid SVG; re-formatting is the
 *               editor's concern
 *   getVersion → `state.content_version` so UI-state emissions
 *               (selection, scope, mode, tool) don't strand the
 *               agent's writes as stale between read and edit
 *   subscribe  → wires editor emissions into the fs's auto-flush
 *
 * The owning `AgentFs` (built once per file window in
 * {@link ./../file/active-editor-agent-fs}) uses a `MemoryBackend` — there's
 * no persistence concern here. The file on disk is written by the surface's
 * own Cmd+S path; this `AgentFs` is a renderer-only scratch surface the agent
 * reads/edits during a turn. The mount is **re-pointed** at whichever editor
 * is active (the single document, or the active slide), so this binding is
 * intentionally per-editor and cheap to reconstruct.
 */

"use client";

import type { AgentFs } from "@grida/agent/fs";
import type { SvgEditor } from "@grida/svg-editor";
// Pure helper, no AI/billing imports — safe under the desktop ESLint
// boundary. Kept in the canvas-web folder because pretty-printing is
// SVG-specific and the original lives there; moving it to a shared
// package is a follow-up if a third caller appears.
import { formatSvg } from "@/app/(canvas)/svg/_ai/format-svg";

/** The single virtual path the active editor is mounted at. */
export const CANVAS_PATH = "/canvas.svg" as const;

export function bindEditor(editor: SvgEditor): AgentFs.LiveBinding {
  return {
    serialize: () => formatSvg(editor.serialize()),
    load: (content) => editor.load(content),
    getVersion: () => editor.state.content_version,
    subscribe: (cb) => editor.subscribe(cb),
  };
}
