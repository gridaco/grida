import { Input } from "@/components/ui/input";
import { inputVariants } from "./utils/input-variants";
import React from "react";
import { cn } from "@/utils";

export function InputControl({
  id,
  type = "text",
  name,
  value,
  autoComplete = "off",
  onValueChange,
  placeholder = "Enter",
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onValueChange?: (value?: string) => void;
}) {
  return (
    <Input
      type={type}
      name={name}
      id={id}
      value={value}
      placeholder={placeholder}
      className={cn(inputVariants({ size: "sm" }), className)}
      onChange={(e) => {
        onValueChange?.(e.target.value || undefined);
      }}
      {...props}
    />
  );
}
