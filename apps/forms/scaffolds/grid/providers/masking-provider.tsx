import { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { mask } from "../grid-text-mask";

export function useMasking() {
  const [state] = useEditorState();
  return useCallback(
    (txt: string): string => {
      return state.datagrid_local_filter.masking_enabled &&
        typeof txt === "string"
        ? mask(txt)
        : txt.toString();
    },
    [state.datagrid_local_filter.masking_enabled]
  );
}
