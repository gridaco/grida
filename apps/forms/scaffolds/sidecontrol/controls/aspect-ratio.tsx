import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function AspectRatioControl({
  value,
  onValueChange,
}: {
  value?: number;
  onValueChange?: (value?: number) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onValueChange?.(parseFloat(e.target.value) || undefined)}
      className={inputVariants({ size: "sm" })}
    />
  );
}
