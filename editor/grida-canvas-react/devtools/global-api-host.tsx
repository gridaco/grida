import { useEffect } from "react";
import { useCurrentEditor } from "../use-editor";

export function useWindowGlobalCurrentEditor() {
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

export function WindowGlobalCurrentEditorProvider() {
  useWindowGlobalCurrentEditor();
  return null;
}
