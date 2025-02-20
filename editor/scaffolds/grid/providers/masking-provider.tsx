import { useCallback } from "react";
import { MarkerConfig, mask } from "../grid-text-mask";
import { useDataGridState } from "./datagrid-state-provider";

export function useMasking() {
  const { masking_enabled } = useDataGridState();

  return useCallback(
    (txt: string | undefined, config?: MarkerConfig): string | undefined => {
      return masking_enabled && typeof txt === "string"
        ? mask(txt, config)
        : txt?.toString();
    },
    [masking_enabled]
  );
}
