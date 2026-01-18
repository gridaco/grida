import { useEffect } from "react";
import { useCurrentEditor } from "../use-editor";

export function useWindowGlobalCurrentEditor() {
  const editor = useCurrentEditor();
  useEffect(() => {
    // @ts-expect-error - Assigning editor to globalThis for devtools
    globalThis["grida"] = editor;
    return () => {
      // @ts-expect-error - Deleting from globalThis
      delete globalThis["grida"];
    };
  }, [editor]);
}

export function WindowGlobalCurrentEditorProvider() {
  useWindowGlobalCurrentEditor();
  return null;
}
