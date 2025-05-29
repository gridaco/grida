import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import { PropertyNumber } from "../ui";

export function RotateControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <PropertyNumber
      placeholder="0deg"
      value={value}
      onValueChange={onValueChange}
    />
  );
}
