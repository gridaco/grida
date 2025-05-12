import {
  TextAlignTopIcon,
  TextAlignMiddleIcon,
  TextAlignBottomIcon,
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import type { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

type TextAlignVertical = cg.TextAlignVertical;

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
