import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { inputVariants } from "./utils/input-variants";

export function FlexWrapControl({
  value,
  onValueChange,
}: {
  value?: "wrap" | "nowrap";
  onValueChange?: (value: "wrap" | "nowrap") => void;
}) {
  return (
    <ToggleGroup
      id="flex-wrap"
      type="single"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem className={inputVariants({ size: "sm" })} value="wrap">
        Yes
      </ToggleGroupItem>
      <ToggleGroupItem className={inputVariants({ size: "sm" })} value="nowrap">
        No
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
