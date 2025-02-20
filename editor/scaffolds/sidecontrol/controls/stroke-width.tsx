import type { TChange, TMixed } from "./utils/types";
import { PropertyNumber } from "../ui";

export function StrokeWidthControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: TChange<number>) => void;
}) {
  return (
    <PropertyNumber
      type="number"
      value={value}
      min={0}
      step={1}
      onValueChange={onValueChange}
    />
  );
}
