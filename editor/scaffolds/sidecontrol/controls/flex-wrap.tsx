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
      defaultValue="nowrap"
      value={value}
      // toggle group can callback with "" when de-selecting, will prevent this.
      onValueChange={(v) => v !== "" && onValueChange?.(v as "wrap" | "nowrap")}
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
