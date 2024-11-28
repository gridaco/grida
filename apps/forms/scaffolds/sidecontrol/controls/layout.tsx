import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { grida } from "@/grida";
import { WorkbenchUI } from "@/components/workbench";

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
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Display" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={"flow" satisfies Layout}>Normal Flow</SelectItem>
        <SelectItem value={"flex" satisfies Layout}>Flex</SelectItem>
      </SelectContent>
    </Select>
  );
}
