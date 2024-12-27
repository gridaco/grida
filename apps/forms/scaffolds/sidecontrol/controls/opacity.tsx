import { Slider } from "./utils/slider";
import { WorkbenchUI } from "@/components/workbench";
import { PropertyNumber } from "../ui";
import { grida } from "@/grida";
import type { TChange, TMixed } from "./utils/types";

export function OpacityControl({
  value,
  onValueChange,
}: {
  value?: TMixed<number>;
  onValueChange?: (change: TChange<number>) => void;
}) {
  return (
    <div
      className={WorkbenchUI.inputVariants({
        variant: "container",
        size: "container",
      })}
    >
      <div className="flex-1">
        <PropertyNumber
          value={value}
          min={0}
          max={1}
          step={0.01}
          onValueChange={onValueChange}
        />
      </div>
      <div className="flex-1">
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={value === grida.mixed ? [0.5] : value ? [value] : undefined}
          onValueChange={([value]) => {
            onValueChange?.({ type: "set", value });
          }}
        />
      </div>
    </div>
  );
}
