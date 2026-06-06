import { Input } from "@app/ui/components/input";
import { WorkbenchUI } from "@/components/workbench";

export function NameControl({
  value,
  onValueChange,
  disabled,
}: {
  value: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Input
      disabled={disabled}
      value={value}
      onChange={(e) => {
        onValueChange?.(e.target.value);
      }}
      placeholder="Name"
      className={WorkbenchUI.inputVariants({ size: "xs" })}
    />
  );
}
