import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

export function StrokeWidthControl({
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
      type="number"
      value={value}
      min={0}
      step={1}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}
