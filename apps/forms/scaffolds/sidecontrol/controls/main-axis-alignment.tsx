import type { grida } from "@/grida";
import type { TMixed } from "./utils/types";
import { PropertyEnum } from "../ui";

type MainAxisAlignment = grida.program.cg.MainAxisAlignment;

export function MainAxisAlignmentControl({
  value,
  onValueChange,
}: {
  value?: TMixed<MainAxisAlignment>;
  onValueChange?: (value: MainAxisAlignment) => void;
}) {
  return (
    <PropertyEnum<MainAxisAlignment>
      enum={[
        {
          label: "Start",
          value: "start",
        },
        {
          label: "Center",
          value: "center",
        },
        {
          label: "Space Between",
          value: "space-between",
        },
        {
          label: "Space Around",
          value: "space-around",
        },
        {
          label: "Space Evenly",
          value: "space-evenly",
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
