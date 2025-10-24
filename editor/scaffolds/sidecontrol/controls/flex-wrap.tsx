import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";

export function FlexWrapControl({
  value = "nowrap",
  onValueChange,
}: {
  value?: "wrap" | "nowrap";
  onValueChange?: (value: "wrap" | "nowrap") => void;
}) {
  return (
    <ToggleGroup
      id="flex-wrap"
      type="single"
      size="sm"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value="wrap" className="text-xs">
        Yes
      </ToggleGroupItem>
      <ToggleGroupItem value="nowrap" className="text-xs">
        No
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
