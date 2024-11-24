import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";

type Padding = grida.program.nodes.i.IPadding["padding"];

export function PaddingControl({
  value = 0,
  onValueChange,
}: {
  value: Padding;
  onValueChange?: (value: Padding) => void;
}) {
  return (
    <Input
      type="number"
      value={
        typeof value === "number"
          ? // TODO: support individual padding values
            value
          : value.paddingLeft
      }
      placeholder="inherit"
      min={0}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
