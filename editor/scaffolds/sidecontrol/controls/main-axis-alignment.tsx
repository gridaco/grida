import { PropertyEnum } from "../ui";
import type { TMixed } from "./utils/types";
import type cg from "@grida/cg";

type MainAxisAlignment = cg.MainAxisAlignment;

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
          label: "End",
          value: "end",
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
