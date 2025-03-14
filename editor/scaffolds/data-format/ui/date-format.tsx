"use client";

import React from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { DataFormat } from "..";
import { Labels } from "@/k/labels";

export function DateFormatRadioGroup({
  value,
  onValueChange,
}: {
  value: DataFormat.DateFormat;
  onValueChange?: (value: DataFormat.DateFormat) => void;
}) {
  return (
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(value) => {
        onValueChange?.(value as DataFormat.DateFormat);
      }}
    >
      <DropdownMenuRadioItem value="date">
        Date
        <DropdownMenuShortcut>
          {Labels.starwarsday.toLocaleDateString()}
        </DropdownMenuShortcut>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="time">
        Time
        <DropdownMenuShortcut>
          {Labels.starwarsday.toLocaleTimeString()}
        </DropdownMenuShortcut>
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="datetime">
        Date Time
        <DropdownMenuShortcut className="ms-4">
          {Labels.starwarsday.toLocaleString()}
        </DropdownMenuShortcut>
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}
