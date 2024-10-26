import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function SrcControl({
  value = "",
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value?: string) => void;
}) {
  return (
    <Input
      type="url"
      value={value}
      placeholder="inherit"
      min={0}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(e.target.value);
      }}
    />
  );
}
