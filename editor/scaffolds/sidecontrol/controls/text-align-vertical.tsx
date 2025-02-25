import {
  TextAlignTopIcon,
  TextAlignMiddleIcon,
  TextAlignBottomIcon,
} from "@radix-ui/react-icons";
import type { grida } from "@/grida";
import type { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

type TextAlignVertical = grida.program.cg.TextAlignVertical;

export function TextAlignVerticalControl({
  value,
  onValueChange,
}: {
  value?: TMixed<TextAlignVertical>;
  onValueChange?: (value: TextAlignVertical) => void;
}) {
  return (
    <PropertyEnumToggle<TextAlignVertical>
      enum={[
        {
          label: "Top",
          value: "top" satisfies TextAlignVertical,
          icon: <TextAlignTopIcon />,
        },
        {
          label: "Center",
          value: "center" satisfies TextAlignVertical,
          icon: <TextAlignMiddleIcon />,
        },
        {
          label: "Bottom",
          value: "bottom" satisfies TextAlignVertical,
          icon: <TextAlignBottomIcon />,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
