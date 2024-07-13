import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

export function StringLiteralControl({
  value,
  onChangeValue,
}: {
  value?: string;
  onChangeValue?: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChangeValue?.(e.target.value)}
      className={inputVariants({ size: "sm" })}
    />
  );
}
