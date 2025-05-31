import { Slider } from "./utils/slider";
import { WorkbenchUI } from "@/components/workbench";
import InputPropertyNumber from "../ui/number";
import grida from "@grida/schema";
import type { editor } from "@/grida-canvas";
import type { TMixed } from "./utils/types";

export function OpacityControl({
  value,
  onValueChange,
  onValueCommit,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: editor.api.NumberChange) => void;
  onValueCommit?: (change: editor.api.NumberChange) => void;
}) {
  return (
    <div
      className={WorkbenchUI.inputVariants({
        variant: "container",
        size: "xs",
      })}
    >
      <div className="flex-1">
        <InputPropertyNumber
          mode="auto"
          type="number"
          value={value}
          min={0}
          max={1}
          step={0.01}
          onValueChange={onValueChange}
          onValueCommit={onValueCommit}
        />
      </div>
      <div className="flex-1">
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={value === grida.mixed ? [0.5] : value ? [value] : undefined}
          onValueChange={([value]) => {
            // use commit for slider
            onValueCommit?.({ type: "set", value });
          }}
        />
      </div>
    </div>
  );
}
