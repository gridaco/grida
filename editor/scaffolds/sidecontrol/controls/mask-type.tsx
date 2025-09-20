import type cg from "@grida/cg";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export function MaskTypeControl({
  value = "alpha",
  onValueChange,
}: {
  value?: TMixed<cg.LayerMaskType> | null;
  onValueChange?: (value: cg.LayerMaskType) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "Alpha",
          value: "alpha" satisfies cg.LayerMaskType,
        },
        {
          label: "Luminance",
          value: "luminance" satisfies cg.LayerMaskType,
        },
        {
          label: "Shape",
          value: "geometry" satisfies cg.LayerMaskType,
        },
      ]}
      value={value ?? undefined}
      onValueChange={onValueChange}
    />
  );
}
