import React, { useEffect } from "react";
import { useCurrentEditor } from "../use-editor";

export function useWindowCurrentEditor() {
  const editor = useCurrentEditor();
  useEffect(() => {
    // @ts-expect-error
    globalThis["grida"] = editor;
    return () => {
      // @ts-expect-error
      delete globalThis["grida"];
    };
  }, [editor]);
}

export function WindowCurrentEditorProvider() {
  useWindowCurrentEditor();
  return null;
}
