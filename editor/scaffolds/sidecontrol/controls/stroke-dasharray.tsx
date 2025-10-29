import type { TMixed } from "./utils/types";
import { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

export function StrokeDashArrayControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number[] | undefined>;
  onValueChange?: (value: number[] | undefined) => void;
  onValueCommit?: (value: number[] | undefined) => void;
}) {
  // For now, just take the first value if it's an array
  const numericValue =
    value && Array.isArray(value) && value.length > 0 ? value[0] : undefined;

  return (
    <InputPropertyNumber
      type="number"
      value={numericValue}
      min={0}
      max={100}
      step={1}
      placeholder="0"
      onValueChange={(change: editor.api.NumberChange) => {
        if (onValueChange) {
          // Wrap single number as [value, value] pattern
          const arrayValue =
            change.value !== undefined
              ? [change.value, change.value]
              : undefined;
          onValueChange(arrayValue);
        }
      }}
      onValueCommit={(change: editor.api.NumberChange) => {
        if (onValueCommit) {
          // Wrap single number as [value, value] pattern
          const arrayValue =
            change.value !== undefined
              ? [change.value, change.value]
              : undefined;
          onValueCommit(arrayValue);
        }
      }}
    />
  );
}
