import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@radix-ui/react-icons";
import type { grida } from "@/grida";
import type { TMixed } from "./utils/types";
import { PropertyEnumToggle } from "../ui";

type TextAlign = grida.program.cg.TextAlign;

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
          value: "left" satisfies grida.program.cg.TextAlign,
          icon: <TextAlignLeftIcon />,
        },
        {
          label: "Center",
          value: "center" satisfies grida.program.cg.TextAlign,
          icon: <TextAlignCenterIcon />,
        },
        {
          label: "Right",
          value: "right" satisfies grida.program.cg.TextAlign,
          icon: <TextAlignRightIcon />,
        },
      ]}
      value={value}
      onValueChange={onValueChange}
    />
  );
}
