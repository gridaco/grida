import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";

export function MainAxisAlignmentControl({
  value,
  onValueChange,
}: {
  value: grida.program.cg.MainAxisAlignment;
  onValueChange?: (value: grida.program.cg.MainAxisAlignment) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (!v) return;
        onValueChange?.(v as grida.program.cg.MainAxisAlignment);
      }}
    >
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          value={"start" satisfies grida.program.cg.MainAxisAlignment}
        >
          Start
        </SelectItem>
        <SelectItem
          value={"center" satisfies grida.program.cg.MainAxisAlignment}
        >
          Center
        </SelectItem>
        <SelectItem
          value={"space-between" satisfies grida.program.cg.MainAxisAlignment}
        >
          Space Between
        </SelectItem>
        <SelectItem
          value={"space-around" satisfies grida.program.cg.MainAxisAlignment}
        >
          Space Around
        </SelectItem>
        <SelectItem
          value={"space-evenly" satisfies grida.program.cg.MainAxisAlignment}
        >
          Space Evenly
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
