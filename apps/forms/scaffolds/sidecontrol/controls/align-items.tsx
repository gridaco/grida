import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import {
  AlignLeftIcon,
  AlignRightIcon,
  AlignCenterHorizontallyIcon,
} from "@radix-ui/react-icons";

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
      <ToggleGroupItem value="start">
        <AlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        <AlignCenterHorizontallyIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="end">
        <AlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
