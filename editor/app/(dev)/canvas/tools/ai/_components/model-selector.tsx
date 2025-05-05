"use client";

import * as React from "react";
import { PopoverProps } from "@radix-ui/react-popover";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/utils/cn";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type OpenAI from "openai";
type Model = OpenAI.Models.Model;

import { useModels } from "../_hooks/use-models";

interface ModelSelectorProps extends PopoverProps {
  onValueChange?: (model: Model) => void;
}

export function ModelSelector({ ...props }: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState<Model>();

  const { data: models } = useModels();

  return (
    <Popover open={open} onOpenChange={setOpen} {...props}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select a model"
          className="w-full justify-between"
        >
          {selectedModel ? selectedModel.id : "Select a model..."}
          <ChevronsUpDown className="opacity-50 size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <Command loop>
          <CommandList className="h-[var(--cmdk-list-height)] max-h-[400px]">
            <CommandInput placeholder="Search Models..." />
            <CommandEmpty>No Models found.</CommandEmpty>
            {models?.data.map((model) => (
              <ModelItem
                key={model.id}
                model={model}
                isSelected={selectedModel?.id === model.id}
                onSelect={() => {
                  setSelectedModel(model);
                  props.onValueChange?.(model);
                  setOpen(false);
                }}
              />
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface ModelItemProps {
  model: Model;
  isSelected: boolean;
  onSelect: () => void;
}

function ModelItem({ model, isSelected, onSelect }: ModelItemProps) {
  return (
    <CommandItem key={model.id} onSelect={onSelect}>
      {model.id}
      <Check
        className={cn(
          "ml-auto size-4",
          isSelected ? "opacity-100" : "opacity-0"
        )}
      />
    </CommandItem>
  );
}
