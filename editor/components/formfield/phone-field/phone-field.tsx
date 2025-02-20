import { PhoneInput } from "@/components/extension/phone-input";
import React from "react";

export function PhoneField({
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof PhoneInput>, "onChange"> & {
  onValueChange: (value: string) => void;
}) {
  return <PhoneInput locales={["ko"]} {...props} onChange={onValueChange} />;
}
