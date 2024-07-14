import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ViewHorizontalIcon, ViewVerticalIcon } from "@radix-ui/react-icons";
import { inputVariants } from "./utils/input-variants";

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
      <ToggleGroupItem value="row" className={inputVariants({ size: "sm" })}>
        <ViewVerticalIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="column" className={inputVariants({ size: "sm" })}>
        <ViewHorizontalIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
