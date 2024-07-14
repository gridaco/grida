import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlignLeftIcon,
  AlignRightIcon,
  AlignCenterVerticallyIcon,
  AlignCenterHorizontallyIcon,
} from "@radix-ui/react-icons";
import { inputVariants } from "./utils/input-variants";

export function AlignItemsControl({
  value,
  onValueChange,
}: {
  value?: "start" | "center" | "end";
  onValueChange?: (value: "start" | "center" | "end") => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="align-items"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem className={inputVariants({ size: "sm" })} value="start">
        <AlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem className={inputVariants({ size: "sm" })} value="center">
        <AlignCenterHorizontallyIcon />
      </ToggleGroupItem>
      <ToggleGroupItem className={inputVariants({ size: "sm" })} value="end">
        <AlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
