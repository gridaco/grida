import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grida } from "@/grida";

type Layout = grida.program.nodes.i.IFlexContainer["layout"];

export function LayoutControl({
  value,
  onValueChange,
}: {
  value: Layout;
  onValueChange?: (value: Layout) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger>
        <SelectValue placeholder="Display" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={"flow" satisfies Layout}>Flow</SelectItem>
        <SelectItem value={"flex" satisfies Layout}>Flex</SelectItem>
      </SelectContent>
    </Select>
  );
}
