import React from "react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { WorkbenchUI } from "@/components/workbench";

type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

export function FontWeightControl({
  value = 400,
  onValueChange,
}: {
  value?: FontWeight;
  onValueChange?: (value: FontWeight) => void;
}) {
  return (
    <Select
      value={value?.toString()}
      onValueChange={(v) => {
        onValueChange?.(parseInt(v) as FontWeight);
      }}
    >
      <SelectTrigger className={WorkbenchUI.inputVariants({ size: "sm" })}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="100">Thin</SelectItem>
        <SelectItem value="200">Extra Light</SelectItem>
        <SelectItem value="300">Light</SelectItem>
        <SelectItem value="400">Regular</SelectItem>
        <SelectItem value="500">Medium</SelectItem>
        <SelectItem value="600">Semi Bold</SelectItem>
        <SelectItem value="700">Bold</SelectItem>
        <SelectItem value="800">Extra Bold</SelectItem>
        <SelectItem value="900">Black</SelectItem>
      </SelectContent>
    </Select>
  );
}
