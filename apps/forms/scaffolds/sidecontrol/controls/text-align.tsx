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
  value?: grida.program.cg.TextAign;
  onValueChange?: (value: grida.program.cg.TextAign) => void;
}) {
  return (
    <ToggleGroup
      type="single"
      id="horizontal"
      value={value}
      onValueChange={onValueChange}
    >
      <ToggleGroupItem value={"left" satisfies grida.program.cg.TextAign}>
        <TextAlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value={"center" satisfies grida.program.cg.TextAign}>
        <TextAlignCenterIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value={"right" satisfies grida.program.cg.TextAign}>
        <TextAlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
