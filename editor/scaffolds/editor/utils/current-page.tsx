import { useEffect } from "react";
import type { EditorState } from "../state";
import { useEditorState } from "../use";

export function CurrentPage({
  page,
  fallback,
  children,
}: React.PropsWithChildren<{
  page: EditorState["selected_page_id"];
  fallback?: React.ReactNode;
}>) {
  const [state, dispatch] = useEditorState();
  const { selected_page_id } = state;

  useEffect(() => {
    dispatch({
      type: "editor/select-page",
      page_id: page,
    });
  }, [page]);

  if (selected_page_id !== page) {
    return fallback ? <>{fallback}</> : <></>;
  }

  return <>{children}</>;
}
