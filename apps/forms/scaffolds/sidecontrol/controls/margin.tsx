import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function MarginControl({
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
      step={1}
      className={inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
