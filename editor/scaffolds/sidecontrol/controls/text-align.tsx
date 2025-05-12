import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@radix-ui/react-icons";
import type cg from "@grida/cg";
import type { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

type TextAlign = cg.TextAlign;

export function TextAlignControl({
  value,
  onValueChange,
}: {
  value?: TMixed<TextAlign>;
  onValueChange?: (value: TextAlign) => void;
}) {
  return (
    <PropertyEnumToggle<TextAlign>
      enum={[
        {
          label: "Left",
          value: "left" satisfies cg.TextAlign,
          icon: <TextAlignLeftIcon />,
        },
        {
          label: "Center",
          value: "center" satisfies cg.TextAlign,
          icon: <TextAlignCenterIcon />,
        },
        {
          label: "Right",
          value: "right" satisfies cg.TextAlign,
          icon: <TextAlignRightIcon />,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
