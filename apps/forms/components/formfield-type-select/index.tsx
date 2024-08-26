"use clinet";

import React from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import { supported_field_types, fieldlabels } from "@/k/supported_field_types";
import type { FormInputType } from "@/types";
import { CheckIcon, ChevronDownIcon } from "@radix-ui/react-icons";

type FormFieldTypeSelectOptionItem = {
  value: FormInputType;
  label: string;
  disabled?: boolean;
};

const all_supported_field_type_items: FormFieldTypeSelectOptionItem[] =
  supported_field_types.map((t) => ({
    value: t,
    label: fieldlabels[t],
    disabled: false,
  }));

export function TypeSelect({
  value,
  onValueChange,
  options = all_supported_field_type_items,
}: {
  value?: FormInputType;
  onValueChange: (value: FormInputType) => void;
  options?: FormFieldTypeSelectOptionItem[];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between capitalize"
        >
          <div className="flex gap-2 items-center">
            {value && <FormFieldTypeIcon type={value} className="w-4 h-4" />}
            {value ? value : "Select"}
          </div>
          <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] max-h-[--radix-popover-content-available-height] p-0">
        <Command>
          <CommandInput placeholder="Search" />
          <CommandEmpty>No input found.</CommandEmpty>
          <CommandList>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue as FormInputType);
                    setOpen(false);
                  }}
                >
                  <CheckIcon
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <FormFieldTypeIcon type={opt.value} className="w-4 h-4" />
                    <span className="capitalize">{opt.label}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
