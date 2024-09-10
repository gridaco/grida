"use client";
import React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  language_label_map,
  supported_form_page_languages,
} from "@/k/supported_languages";
import { LanguageCode } from "@/types";
import { cn } from "@/utils";

/**
 * easily provide override for language options
 */
export type LanguageSelectOptionMap = Partial<
  Record<
    LanguageCode,
    {
      disabled?: boolean;
    }
  >
>;

export function LanguageSelect({
  name,
  required,
  value,
  defaultValue,
  onValueChange,
  options = supported_form_page_languages,
  optionsmap,
  className,
  placeholder = "Select language",
}: {
  name?: string;
  required?: boolean;
  value?: LanguageCode;
  defaultValue?: LanguageCode;
  onValueChange?: (value: LanguageCode) => void;
  options?: LanguageCode[];
  optionsmap?: LanguageSelectOptionMap;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Select
      name={name}
      value={value}
      required={required}
      defaultValue={defaultValue}
      onValueChange={(value) => {
        onValueChange?.(value as LanguageCode);
      }}
    >
      <SelectTrigger className={cn("overflow-hidden text-ellipsis", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((lang) => {
          const disabled = optionsmap?.[lang]?.disabled;
          return (
            <SelectItem key={lang} value={lang} disabled={disabled}>
              {language_label_map[lang].flag} {language_label_map[lang].label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
