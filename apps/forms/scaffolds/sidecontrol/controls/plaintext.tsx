import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function PlainTextControl({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value?: string) => void;
}) {
  return (
    <Input
      type="text"
      value={value}
      placeholder="Enter"
      className={inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(e.target.value || undefined);
      }}
    />
  );
}
