import { useDispatch } from "core/dispatch";
import { useEditorState } from "core/states";
import React, { useEffect } from "react";

export function EditorTranspilerEsbuildProvider({
  children,
}: React.PropsWithChildren<{}>) {
  const [state] = useEditorState();
  const dispatch = useDispatch();

  useEffect(() => {}, []);

  return <>{children}</>;
}
