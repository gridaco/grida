import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function LetterSpacingControl({
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
      placeholder="inherit"
      min={1}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        const v = parseInt(e.target.value);
        if (isNaN(v)) {
          return;
        }
        onValueChange?.(v);
      }}
    />
  );
}
