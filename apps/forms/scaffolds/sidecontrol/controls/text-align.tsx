import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@radix-ui/react-icons";

export function TextAlignControl({
  value,
  onValueChange,
}: {
  value?: "left" | "center" | "right";
  onValueChange?: (value: "left" | "center" | "right") => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="horizontal"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value="left">
        <TextAlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="center">
        <TextAlignCenterIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="right">
        <TextAlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
