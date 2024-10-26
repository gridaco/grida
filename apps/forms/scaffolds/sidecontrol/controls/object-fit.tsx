import React from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";

/**
 * https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit
 */
type ObjectFit = "fill" | "contain" | "cover" | "none" | "scale-down";

export function ObjectFitControl({
  value = "none",
  onValueChange,
}: {
  value?: ObjectFit;
  onValueChange?: (value: ObjectFit) => void;
}) {
  return (
    <Select
      value={value?.toString()}
      onValueChange={(v) => {
        onValueChange?.(v as ObjectFit);
      }}
    >
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue placeholder="Fit" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="fill">Fill</SelectItem>
        <SelectItem value="contain">Contain</SelectItem>
        <SelectItem value="cover">Cover</SelectItem>
        <SelectItem value="none">None</SelectItem>
        <SelectItem value="scale-down">Scale Down</SelectItem>
      </SelectContent>
    </Select>
  );
}
