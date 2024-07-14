import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";

export function FlexDirectionControl({
  value,
  onValueChange,
}: {
  value?: "row" | "column";
  onValueChange?: (value: "row" | "column") => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="flex-direction"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value="row">
        <ViewVerticalIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="column">
        <ViewHorizontalIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
