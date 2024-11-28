import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";

export function GapControl({
  value,
  onValueChange,
}: {
  value: { mainAxisGap: number; crossAxisGap: number };
  onValueChange?: (
    value: number | { mainAxisGap: number; crossAxisGap: number }
  ) => void;
}) {
  return (
    <Input
      type="number"
      // TODO: individual gap control
      value={value.mainAxisGap === value.crossAxisGap ? value.mainAxisGap : ""}
      placeholder="gap"
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
