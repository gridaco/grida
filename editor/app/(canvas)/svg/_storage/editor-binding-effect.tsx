"use client";

import { useEffect } from "react";
import { useSvgEditor } from "@grida/svg-editor/react";
import { useSvgDocStore } from "./context";

/**
 * Ties the currently-mounted `SvgEditor` to the `SvgDocStore`. Lives
 * inside `<SvgEditorProvider>` so `useSvgEditor()` resolves. Idempotent
 * on the editor identity — when the editor changes (e.g. doc switch
 * triggers a keyed remount), the store re-binds and final-flushes the
 * previous editor.
 */
export function EditorBindingEffect() {
  const store = useSvgDocStore();
  const editor = useSvgEditor();
  useEffect(() => {
    store.attachEditor(editor);
    return () => store.detachEditor();
  }, [store, editor]);
  return null;
}
