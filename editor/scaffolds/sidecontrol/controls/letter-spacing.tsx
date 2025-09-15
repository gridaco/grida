import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import InputPropertyPercentage from "../ui/percentage";

export function LetterSpacingControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <InputPropertyPercentage
      mode="auto"
      type="number"
      value={value}
      placeholder="inherit"
      step={0.01}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}
