import { Input } from "@/components/ui/input";
import React from "react";
import { WorkbenchUI } from "@/components/workbench";

export function HrefControl({
  value,
  onValueChange,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      placeholder="https://example.com"
      className={WorkbenchUI.inputVariants({ size: "sm" })}
    />
  );
}
