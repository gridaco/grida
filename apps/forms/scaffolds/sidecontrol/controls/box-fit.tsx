import React from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";
import { grida } from "@/grida";

export function BoxFitControl({
  value = "none",
  onValueChange,
}: {
  value?: grida.program.cg.BoxFit;
  onValueChange?: (value: grida.program.cg.BoxFit) => void;
}) {
  return (
    <Select
      value={value?.toString()}
      onValueChange={(v) => {
        onValueChange?.(v as grida.program.cg.BoxFit);
      }}
    >
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "xs" })}>
        <SelectValue placeholder="Fit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={"none" satisfies grida.program.cg.BoxFit}>
          None
        </SelectItem>
        <SelectItem value={"contain" satisfies grida.program.cg.BoxFit}>
          Contain
        </SelectItem>
        <SelectItem value={"cover" satisfies grida.program.cg.BoxFit}>
          Cover
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
