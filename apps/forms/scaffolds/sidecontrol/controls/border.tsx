import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";

type Border = {
  borderWidth?: number;
};

export function BorderControl({
  value,
  onValueChange,
}: {
  value?: Border;
  onValueChange?: (value?: Border) => void;
}) {
  return (
    <Input
      type="number"
      className={inputVariants({ size: "sm" })}
      value={value?.borderWidth}
      onChange={(e) =>
        onValueChange?.({
          ...(value || {}),
          borderWidth: parseInt(e.target.value),
        })
      }
    />
  );
}
