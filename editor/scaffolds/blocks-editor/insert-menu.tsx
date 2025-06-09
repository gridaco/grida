"use client";

import React from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui-editor/dialog";
import { cn } from "@/components/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BlockTypeIcon } from "@/components/form-block-type-icon";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import { blocklabels } from "@/k/supported_block_types";
import { annotations } from "@/k/supported_field_types";
import useInsertFormBlockMenu from "./use-insert-form-block";
import { DummyFormAgentStateProvider } from "@/grida-forms/formstate";
import FormField from "@/components/formfield/form-field";
import type { FormBlockType, FormInputType } from "@/grida-forms-hosted/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { PopoverContentProps } from "@radix-ui/react-popover";

export function InsertCommandDialogTrigger({
  className,
}: {
  className?: string;
}) {
  const insertCommandDialog = useDialogState("insert-command-dialog");

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label="insert form block"
            role="combobox"
            variant={"outline"}
            size="icon"
            className={cn("rounded-full", className)}
            onPointerDown={(e) => {
              // this shall not trigger focused block to lose focus
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={insertCommandDialog.openDialog}
          >
            <PlusIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>Insert block</p>
        </TooltipContent>
      </Tooltip>
      <InsertCommandDialog {...insertCommandDialog.props} />
    </>
  );
}

/**
 * use with <PopoverTrigger>
 * @returns
 */
export function InsertCommandPopover({
  index,
  children,
  onOpenChange,
  align = "start",
  side = "left",
  sideOffset,
  alignOffset,
}: {
  index?: number;
  children: React.ReactElement<typeof PopoverTrigger>;
  onOpenChange?: (open: boolean) => void;
  side?: PopoverContentProps["side"];
  sideOffset?: PopoverContentProps["sideOffset"];
  align?: PopoverContentProps["align"];
  alignOffset?: PopoverContentProps["alignOffset"];
}) {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const {
    search,
    setSearch,
    filtered_block_types,
    filtered_field_types,
    addBlock,
    addFieldBlock,
  } = useInsertFormBlockMenu();

  const handleSelect = (
    type: "block" | "field",
    value: FormBlockType | FormInputType
  ) => {
    if (type === "block") {
      addBlock(value as FormBlockType, index);
    } else {
      addFieldBlock(value as FormInputType, index);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="left">
          <p>Insert block</p>
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        className="w-[300px] p-0"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionPadding={16}
      >
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]_svg]:size-4">
          <CommandInput
            placeholder="Search blocks and fields..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList className="max-h-[300px] overflow-auto">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading={`Blocks (${filtered_block_types.length})`}>
              {filtered_block_types.map((block_type) => (
                <CommandItem
                  key={block_type}
                  onSelect={() => handleSelect("block", block_type)}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <BlockTypeIcon type={block_type} className="size-4" />
                  <span>{blocklabels[block_type]}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading={`Fields (${filtered_field_types.length})`}>
              {filtered_field_types.map((field_type) => (
                <CommandItem
                  key={field_type}
                  onSelect={() => handleSelect("field", field_type)}
                  className="flex items-center gap-2 px-2 py-1.5"
                >
                  <FormFieldTypeIcon type={field_type} className="size-4" />
                  <span>{annotations[field_type].label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function InsertCommandDialog({
  ...props
}: React.ComponentProps<typeof Dialog>) {
  const [selectedType, setSelectedType] = React.useState<{
    type: "block" | "field";
    value: FormBlockType | FormInputType;
  } | null>(null);
  const [peekedType, setPeekedType] = React.useState<{
    type: "block" | "field";
    value: FormBlockType | FormInputType;
  } | null>(null);
  const {
    search,
    setSearch,
    filtered_block_types,
    filtered_field_types,
    addBlock,
    addFieldBlock,
  } = useInsertFormBlockMenu();

  const handleSelect = (
    type: "block" | "field",
    value: FormBlockType | FormInputType
  ) => {
    setSelectedType({ type, value });
  };

  const handlePeek = (
    type: "block" | "field",
    value: FormBlockType | FormInputType
  ) => {
    setPeekedType({ type, value });
  };

  const handleConfirm = () => {
    if (!selectedType) return;
    if (selectedType.type === "block") {
      addBlock(selectedType.value as FormBlockType);
    } else {
      addFieldBlock(selectedType.value as FormInputType);
    }
    props.onOpenChange?.(false);
  };

  const previewType = selectedType || peekedType;

  return (
    <Dialog {...props}>
      <DialogContent
        hideCloseButton
        className="overflow-hidden p-0 !max-w-2xl h-[800px] max-h-[calc(100vh-100px)] flex flex-col"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Insert form block</DialogTitle>
          <DialogDescription>
            Select a block to insert into the canvas
          </DialogDescription>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]_svg]:size-4">
          <CommandInput
            placeholder="Search blocks and fields..."
            value={search}
            onValueChange={setSearch}
            className="border-b"
          />
          <div className="flex-1 flex min-h-0">
            <div className="w-56 flex flex-col min-h-0">
              <CommandList className="flex-1 max-h-none overflow-auto outline-none">
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup
                  heading={`Blocks (${filtered_block_types.length})`}
                >
                  {filtered_block_types.map((block_type) => (
                    <CommandItem
                      key={block_type}
                      onSelect={() => handleSelect("block", block_type)}
                      onMouseEnter={() => handlePeek("block", block_type)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5",
                        selectedType?.type === "block" &&
                          selectedType.value === block_type &&
                          "bg-accent"
                      )}
                    >
                      <BlockTypeIcon type={block_type} className="size-4" />
                      <span>{blocklabels[block_type]}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandGroup
                  heading={`Fields (${filtered_field_types.length})`}
                >
                  {filtered_field_types.map((field_type) => (
                    <CommandItem
                      key={field_type}
                      onSelect={() => handleSelect("field", field_type)}
                      onMouseEnter={() => handlePeek("field", field_type)}
                      className={cn(
                        "flex items-center gap-2 px-2 py-1.5",
                        selectedType?.type === "field" &&
                          selectedType.value === field_type &&
                          "bg-accent"
                      )}
                    >
                      <FormFieldTypeIcon type={field_type} className="size-4" />
                      <span>{annotations[field_type].label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </div>
            <div className="flex-1 border-l py-4 overflow-auto">
              {previewType ? (
                <div className="space-y-4">
                  <div className="px-4 flex items-center gap-2">
                    {previewType.type === "block" ? (
                      <BlockTypeIcon
                        type={previewType.value as FormBlockType}
                        className="size-6"
                      />
                    ) : (
                      <FormFieldTypeIcon
                        type={previewType.value as FormInputType}
                        className="size-6"
                      />
                    )}
                    <h3 className="font-medium">
                      {previewType.type === "block"
                        ? blocklabels[previewType.value as FormBlockType]
                        : annotations[previewType.value as FormInputType].label}
                    </h3>
                    {selectedType && (
                      <Button
                        size="sm"
                        className="ml-auto"
                        onClick={handleConfirm}
                      >
                        {selectedType.type === "block"
                          ? "Add Block"
                          : "Add Field"}
                      </Button>
                    )}
                  </div>
                  <hr />
                  <div className="px-4 ">
                    {previewType.type === "field" && (
                      <DummyFormAgentStateProvider>
                        <FormField
                          type={previewType.value as FormInputType}
                          name={"example"}
                          label={
                            annotations[previewType.value as FormInputType]
                              .label + " Example"
                          }
                          placeholder="Example"
                          options={[
                            { id: "1", label: "Option 1", value: "option1" },
                            { id: "2", label: "Option 2", value: "option2" },
                            { id: "3", label: "Option 3", value: "option3" },
                          ]}
                          preview
                        />
                      </DummyFormAgentStateProvider>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  Hover or select a block or field to preview
                </div>
              )}
            </div>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
