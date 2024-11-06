import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";

export function CornerRadiusControl({
  value,
  onValueChange,
}: {
  value?: grida.program.nodes.i.IRectangleCorner["cornerRadius"];
  onValueChange?: (value: number) => void;
}) {
  if (typeof value !== "number") {
    return <>mixed</>;
  }
  return (
    <Input
      type="number"
      value={value}
      placeholder="0"
      min={0}
      step={1}
      className={WorkbenchUI.inputVariants({ size: "sm" })}
      onChange={(e) => {
        onValueChange?.(parseInt(e.target.value));
      }}
    />
  );
}
