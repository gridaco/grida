import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function PaddingControl({
  value = 0,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value?: number) => void;
}) {
  return (
    <Input
      type="number"
      value={value}
      placeholder="inherit"
      min={0}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
