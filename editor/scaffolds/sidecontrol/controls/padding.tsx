import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import grida from "@grida/schema";

type Padding = grida.program.nodes.i.IPadding["padding"];

export function PaddingControl({
  value = 0,
  onValueCommit,
}: {
  value: Padding;
  onValueCommit?: (value: Padding) => void;
}) {
  return (
    <InputPropertyNumber
      mode="fixed"
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
      className={WorkbenchUI.inputVariants({ size: "xs" })}
      onValueCommit={onValueCommit}
    />
  );
}
