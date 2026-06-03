/**
 * `useAgentFsBinding(editor)` — gives the desktop AI sidebar an
 * `AgentFs` mounted to a single virtual canvas path bound to the live
 * `SvgEditor`.
 *
 * Mirrors `editor/app/(canvas)/svg/_ai/binding-svg.ts` (the web
 * `/svg` route's binding) shape-for-shape; the only difference is
 * lifecycle. The web route owns a multi-document `SvgDocStore` and
 * mounts paths per document; the desktop window is one-doc-per-window
 * (Recipe 4), so a single `/canvas.svg` mount is enough.
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
 * The `AgentFs` here uses a `MemoryBackend` — there's no persistence
 * concern. The actual file on disk is managed by the agent sidecar via
 * `bridge.files.write` on Cmd+S; the AgentFs is a renderer-only
 * scratch surface the agent uses to read/edit the working canvas
 * during a turn.
 */

"use client";

import { useEffect, useMemo, useRef } from "react";
import { AgentFs } from "@grida/agent/fs";
import type { SvgEditor } from "@grida/svg-editor";
import { useSvgEditor } from "@grida/svg-editor/react";
// Pure helper, no AI/billing imports — safe under the desktop ESLint
// boundary. Kept in the canvas-web folder because pretty-printing is
// SVG-specific and the original lives there; moving it to a shared
// package is a follow-up if a third caller appears.
import { formatSvg } from "@/app/(canvas)/svg/_ai/format-svg";

const CANVAS_PATH = "/canvas.svg" as const;

function bindEditor(editor: SvgEditor): AgentFs.LiveBinding {
  return {
    serialize: () => formatSvg(editor.serialize()),
    load: (content) => editor.load(content),
    getVersion: () => editor.state.content_version,
    subscribe: (cb) => editor.subscribe(cb),
  };
}

export type AgentFsHandle = {
  fs: AgentFs;
  /** The virtual path the editor is mounted at. */
  canvasPath: string;
};

/**
 * Construct an `AgentFs` bound to the current editor instance for the
 * lifetime of the hook. The returned `fs` and `canvasPath` are stable
 * across renders (re-created only when the underlying editor changes,
 * which it doesn't within a `SvgEditorProvider`).
 */
export function useAgentFsBinding(): AgentFsHandle {
  const editor = useSvgEditor();

  // One AgentFs + binding per editor identity. `SvgEditorProvider`
  // doesn't swap the editor mid-session, so this materializes once.
  const handle = useMemo<AgentFsHandle>(() => {
    const fs = new AgentFs(new AgentFs.MemoryBackend());
    fs.mount(CANVAS_PATH, bindEditor(editor));
    return { fs, canvasPath: CANVAS_PATH };
  }, [editor]);

  // Track the latest handle so the unmount cleanup disposes the
  // correct instance even if React re-runs the effect across editor
  // swaps (defensive — a remount is the realistic path).
  const handleRef = useRef(handle);
  handleRef.current = handle;

  useEffect(() => {
    return () => {
      handleRef.current.fs.dispose();
    };
  }, []);

  return handle;
}
