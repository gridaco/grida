import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function MaxlengthControl({
  value,
  placeholder,
  onValueChange,
}: {
  value?: number;
  placeholder?: string;
  onValueChange?: (value: number | undefined) => void;
}) {
  return (
    <Input
      type="number"
      placeholder={placeholder}
      min={0}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      value={value ?? ""}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        const value = isNaN(v) ? undefined : v;
        onValueChange?.(value);
      }}
    />
  );
}
