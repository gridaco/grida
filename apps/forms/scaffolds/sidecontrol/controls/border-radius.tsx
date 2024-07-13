import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function BorderRadiusControl({
  value,
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
      className={inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
