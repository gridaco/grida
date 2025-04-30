"use client";

import React, { useMemo } from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { DataFormat } from "..";

export function DateTimeZoneRadioGroup({
  value,
  onValueChange,
  children,
}: React.PropsWithChildren<{
  value: DataFormat.DateTZ;
  onValueChange?: (value: DataFormat.DateTZ) => void;
}>) {
  const tzoffset = useMemo(
    () => DataFormat.s2Hmm(new Date().getTimezoneOffset() * -1 * 60),
    []
  );

  return (
    <DropdownMenuRadioGroup
      value={DataFormat.tztostr(value, "browser")}
      onValueChange={(tz) => {
        switch (tz) {
          case "browser":
            onValueChange?.(DataFormat.SYM_LOCALTZ);
            return;
          default:
            onValueChange?.(tz);
            return;
        }
      }}
    >
      <DropdownMenuRadioItem value="browser">
        Local Time
        <DropdownMenuShortcut>(UTC+{tzoffset})</DropdownMenuShortcut>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="UTC">
        UTC Time
        <DropdownMenuShortcut>(UTC+0)</DropdownMenuShortcut>
      </DropdownMenuRadioItem>
      {/* more items (DropdownMenuRadioItem) - can be passed dynamically */}
      {children}
    </DropdownMenuRadioGroup>
  );
}
