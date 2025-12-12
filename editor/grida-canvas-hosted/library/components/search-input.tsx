"use client";

import React from "react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Search as SearchIcon } from "lucide-react";

export type SearchInputProps = {
  placeholder?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
};

export function SearchInput({
  placeholder = "Search...",
  value,
  onChange,
  onKeyDown,
  className,
}: SearchInputProps) {
  return (
    <InputGroup className={`h-7 ${className || ""}`}>
      <InputGroupAddon align="inline-start" className="ps-2">
        <SearchIcon className="size-3" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={placeholder}
        className="!text-xs placeholder:text-xs"
        type="search"
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    </InputGroup>
  );
}
