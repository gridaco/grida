import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import InputPropertyNumber from "../ui/number";

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
    <InputPropertyNumber
      mode="auto"
      type="integer"
      value={value}
      placeholder="inherit"
      step={1}
      onValueChange={onValueChange}
      onValueCommit={onValueCommit}
    />
  );
}
