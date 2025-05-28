import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import { PropertyNumber } from "../ui";

export function StrokeWidthControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
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
