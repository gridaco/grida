import { WorkbenchUI } from "@/components/workbench";
import InputPropertyNumber from "../ui/number";
import grida from "@grida/schema";

export function ArcPropertiesControl({
  value,
  onValueChange,
}: {
  value: grida.program.nodes.i.IEllipseArcData;
  onValueChange?: (change: grida.program.nodes.i.IEllipseArcData) => void;
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
          title="Angle Offset"
          mode="fixed"
          type="number"
          value={value.angle_offset}
          step={1}
          appearance="none"
          onValueChange={(v) => {
            onValueChange?.({ ...value, angle_offset: v });
          }}
        />
      </div>
      <div className="flex-1">
        <InputPropertyNumber
          title="Angle"
          mode="fixed"
          type="number"
          value={value.angle}
          step={1}
          appearance="none"
          onValueChange={(v) => {
            onValueChange?.({ ...value, angle: v });
          }}
        />
      </div>
      <div className="flex-1">
        <InputPropertyNumber
          title="Inner Radius"
          mode="fixed"
          type="number"
          value={value.inner_radius}
          min={0}
          max={1}
          step={0.01}
          appearance="none"
          onValueChange={(v) => {
            onValueChange?.({ ...value, inner_radius: v });
          }}
        />
      </div>
    </div>
  );
}
