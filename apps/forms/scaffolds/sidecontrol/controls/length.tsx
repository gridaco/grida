import { Input } from "@/components/ui/input";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";
import { TMixed } from "./utils/types";

export function LengthControl({
  value,
  onValueChange,
}: {
  value: TMixed<grida.program.css.Length | "auto">;
  onValueChange?: (value: grida.program.css.Length | "auto") => void;
}) {
  return (
    <Input
      type={typeof value === "number" ? "number" : "text"}
      // TODO:
      value={
        value === grida.mixed
          ? "mixed"
          : typeof value === "number" || value === "auto"
            ? value
            : "?"
      }
      placeholder="<length> | auto"
      onChange={(e) => {
        const r = e.target.value;
        const n = parseFloat(r);
        if (isNaN(n)) {
          onValueChange?.("auto");
        } else {
          onValueChange?.(n);
        }
      }}
      className={WorkbenchUI.inputVariants({ size: "xs" })}
    />
  );
}
