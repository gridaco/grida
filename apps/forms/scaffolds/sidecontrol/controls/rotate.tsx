import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function RotateControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value: number) => void;
}) {
  return (
    <Input
      type="number"
      placeholder="0deg"
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      value={value}
      onChange={(e) => {
        const value = parseFloat(e.target.value) || 0;
        onValueChange?.(value);
      }}
    />
  );
}
