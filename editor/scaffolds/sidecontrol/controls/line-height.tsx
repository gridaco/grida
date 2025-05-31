import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

export function LineHeightControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <InputPropertyNumber
      mode="auto"
      type="number"
      value={value}
      placeholder="inherit"
      min={1}
      step={1}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}
