import { grida } from "@/grida";
import { ToggleGroup, ToggleGroupItem } from "./utils/toggle-group";
import {
  TextAlignLeftIcon,
  TextAlignCenterIcon,
  TextAlignRightIcon,
} from "@radix-ui/react-icons";

export function TextAlignControl({
  value,
  onValueChange,
}: {
  value?: grida.program.cg.TextAlign;
  onValueChange?: (value: grida.program.cg.TextAlign) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="horizontal"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value={"left" satisfies grida.program.cg.TextAlign}>
        <TextAlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value={"center" satisfies grida.program.cg.TextAlign}>
        <TextAlignCenterIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value={"right" satisfies grida.program.cg.TextAlign}>
        <TextAlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
