import { TChange, TMixed } from "./utils/types";
import { PropertyNumber } from "../ui";

export function LetterSpacingControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: TChange<number>) => void;
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
