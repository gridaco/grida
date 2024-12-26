import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function StrokeWidthControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      min={0}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (isNaN(v)) {
          return;
        }
        onValueChange?.(v);
      }}
    />
  );
}
