import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";

type TargetBlankOrOther = "_blank" | "_self";

export function TargetBlankControl({
  value,
  onValueChange,
}: {
  value?: TargetBlankOrOther;
  onValueChange?: (value: TargetBlankOrOther) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="horizontal"
      value={value === "_blank" ? "y" : "n"}
      onValueChange={(v) => {
        onValueChange?.(v === "y" ? "_blank" : "_self");
      }}
    >
      <ToggleGroupItem value="y">Yes</ToggleGroupItem>
      <ToggleGroupItem value="n">No</ToggleGroupItem>
    </ToggleGroup>
  );
}
