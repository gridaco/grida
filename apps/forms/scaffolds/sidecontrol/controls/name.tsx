import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function NameControl({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => {
        onValueChange?.(e.target.value);
      }}
      placeholder="Name"
      className={WorkbenchUI.inputVariants({ size: "sm" })}
    />
  );
}
