/**
 * `useActiveEditorAgentFs()` — one stable `AgentFs` for the file window's AI
 * sidebar whose single mount (`/canvas.svg`) follows the **currently-active**
 * `SvgEditor`.
 *
 * Why a stable fs + a moving mount (rather than a fresh fs per editor): the
 * sidebar chat is mounted ONCE at the shell level and its `Chat` instance is
 * memoized on the fs identity. In deck mode the active editor changes on every
 * slide switch (each slide is its own `SvgEditorProvider`, remounted by key),
 * and a new fs identity would rebuild the chat and wipe the conversation. So
 * the fs stays put and we re-point the mount instead.
 *
 * `AgentFs.mount()` replaces an existing binding and tears down its prior
 * subscription (see `fs/index.ts`), so `setActiveEditor` is just a re-mount;
 * `null` unmounts (no canvas visible while a slide loads / an empty deck).
 */

"use client";

import { useCallback, useRef } from "react";
import { AgentFs } from "@grida/agent/fs";
import type { SvgEditor } from "@grida/svg-editor";
import { CANVAS_PATH, bindEditor } from "../ai-sidebar/agent-fs-binding";

export type ActiveEditorAgentFs = {
  /** The stable fs the sidebar chat resolves tool calls against. */
  fs: AgentFs;
  /**
   * Point the `/canvas.svg` mount at `editor`, or unmount when `null`. Safe to
   * call repeatedly — re-mounting swaps the binding and its subscription.
   */
  setActiveEditor: (editor: SvgEditor | null) => void;
};

export function useActiveEditorAgentFs(): ActiveEditorAgentFs {
  // One AgentFs for the window's lifetime. Built lazily on first render and
  // never swapped — the sidebar's `Chat` memo keys on this identity.
  const fsRef = useRef<AgentFs | null>(null);
  if (fsRef.current === null) {
    fsRef.current = new AgentFs(new AgentFs.MemoryBackend());
  }
  const fs = fsRef.current;

  const setActiveEditor = useCallback(
    (editor: SvgEditor | null) => {
      if (editor) fs.mount(CANVAS_PATH, bindEditor(editor));
      else fs.unmount(CANVAS_PATH);
    },
    [fs]
  );

  // Deliberately NOT disposed on unmount. Under React Strict Mode (Next dev) the
  // effect cleanup runs mid-mount (setup → cleanup → setup), and the lazily-
  // created `fs` ref survives that cycle — so a `dispose()` here would leave the
  // window holding a DISPOSED fs whose `mount()` is a silent no-op, and the
  // agent would see an empty filesystem (`list_files` → `[]`). This fs has no OS
  // or network handles; its only teardown need is unsubscribing the live editor,
  // which the active binding already does on `unmount` (the slide/file surface
  // reports `onActiveEditor(null)` when it unmounts). It is GC'd with the window.

  return { fs, setActiveEditor };
}
