import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import { PropertyNumber } from "../ui";

export function LetterSpacingControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <PropertyNumber
      type="integer"
      value={value}
      placeholder="inherit"
      min={0}
      step={1}
      onValueChange={onValueChange}
    />
  );
}
