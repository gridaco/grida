import { BorderDashedIcon, BorderSolidIcon } from "@radix-ui/react-icons";
import { PropertyEnum } from "../ui";
import { TMixed } from "./utils/types";

export type StrokeClass = "solid" | "dashed";

/**
 * High-level stroke style control.
 *
 * Provides a simple "Solid" vs "Dashed" choice.
 * The logic for converting between stroke class and strokeDashArray is handled by the parent component.
 */
export function StrokeClassControl({
  value,
  onValueChange,
}: {
  value?: TMixed<StrokeClass>;
  onValueChange?: (value: StrokeClass) => void;
}) {
  return (
    <PropertyEnum
      enum={[
        {
          label: "Solid",
          icon: <BorderSolidIcon />,
          value: "solid" satisfies StrokeClass,
        },
        {
          label: "Dashed",
          icon: <BorderDashedIcon />,
          value: "dashed" satisfies StrokeClass,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
