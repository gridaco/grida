import { grida } from "@/grida";
import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import {
  TextAlignTopIcon,
  TextAlignMiddleIcon,
  TextAlignBottomIcon,
} from "@radix-ui/react-icons";

export function TextAlignVerticalControl({
  value,
  onValueChange,
}: {
  value?: grida.program.cg.TextAlignVertical;
  onValueChange?: (value: grida.program.cg.TextAlignVertical) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="horizontal"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem
        value={"top" satisfies grida.program.cg.TextAlignVertical}
      >
        <TextAlignTopIcon />
      </ToggleGroupItem>
      <ToggleGroupItem
        value={"center" satisfies grida.program.cg.TextAlignVertical}
      >
        <TextAlignMiddleIcon />
      </ToggleGroupItem>
      <ToggleGroupItem
        value={"bottom" satisfies grida.program.cg.TextAlignVertical}
      >
        <TextAlignBottomIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
