import type { TChange, TMixed } from "./utils/types";
import { PropertyNumber } from "../ui";

export function RotateControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: TChange<number>) => void;
}) {
  return (
    <PropertyNumber
      placeholder="0deg"
      value={value}
      onValueChange={onValueChange}
    />
  );
}
