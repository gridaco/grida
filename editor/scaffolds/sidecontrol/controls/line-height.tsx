import { WorkbenchUI } from "@/components/workbench";
import type { TMixed } from "./utils/types";
import type { editor } from "@/grida-canvas";
import { PropertyNumber } from "../ui";

export function LineHeightControl({
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
      placeholder="inherit"
      min={1}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
      onValueChange={onValueChange}
    />
  );
}
