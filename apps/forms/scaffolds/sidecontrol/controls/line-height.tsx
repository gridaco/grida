import { WorkbenchUI } from "@/components/workbench";
import type { TChange, TMixed } from "./utils/types";
import { PropertyNumber } from "../ui";

export function LineHeightControl({
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
      placeholder="inherit"
      min={1}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
      onValueChange={onValueChange}
    />
  );
}
