import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function PlainTextControl({
  value,
  onValueChange,
  placeholder = "Enter",
}: {
  value?: string;
  onValueChange?: (value?: string) => void;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      value={value}
      placeholder={placeholder}
      className={inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(e.target.value || undefined);
      }}
    />
  );
}
