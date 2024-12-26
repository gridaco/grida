import { grida } from "@/grida";
import { PropertyEnum } from "../ui";

export function StrokeCapControl({
  value,
  onValueChange,
}: {
  value?: grida.program.cg.StrokeCap;
  onValueChange?: (value: grida.program.cg.StrokeCap) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "None",
          value: "butt" satisfies grida.program.cg.StrokeCap,
        },
        {
          label: "Round",
          value: "round" satisfies grida.program.cg.StrokeCap,
        },
        {
          label: "Square",
          value: "square" satisfies grida.program.cg.StrokeCap,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}