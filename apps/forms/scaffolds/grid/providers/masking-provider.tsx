import { useCallback } from "react";
import { useEditorState } from "@/scaffolds/editor";
import { MarkerConfig, mask } from "../grid-text-mask";

export function useMasking() {
  const [state] = useEditorState();
  return useCallback(
    (txt: string | undefined, config?: MarkerConfig): string | undefined => {
      return state.datagrid_local_filter.masking_enabled &&
        typeof txt === "string"
        ? mask(txt, config)
        : txt?.toString();
    },
    [state.datagrid_local_filter.masking_enabled]
  );
}
