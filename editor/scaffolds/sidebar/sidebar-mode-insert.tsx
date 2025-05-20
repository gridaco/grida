"use client";

import React, { useCallback } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { useEditorState } from "@/scaffolds/editor";
import { SidebarMenuGrid, SidebarMenuGridItem } from "@/components/sidebar";
import { annotations } from "@/k/supported_field_types";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import FormField from "@/components/formfield/form-field";
import { Button } from "@/components/ui/button";
import { blocklabels } from "@/k/supported_block_types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import type { FormBlockType, FormInputType } from "@/grida-forms/hosted/types";
import { SearchInput } from "@/components/extension/search-input";
import { DummyFormAgentStateProvider } from "@/lib/formstate";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";
import useInsertFormBlockMenu from "@/scaffolds/blocks-editor/use-insert-form-block";

export function ModeInsertBlocks() {
  const [state, dispatch] = useEditorState();
  const {
    search,
    setSearch,
    filtered_block_types,
    filtered_field_types,
    addBlock,
    addFieldBlock,
  } = useInsertFormBlockMenu();

  const handleAddBlock = useCallback(
    (block: FormBlockType) => {
      addBlock(block);
      close();
    },
    [addBlock, close]
  );

  const handleAddFieldBlock = useCallback(
    (type: FormInputType) => {
      addFieldBlock(type);
      close();
    },
    [addFieldBlock, close]
  );

  return (
    <>
      <SidebarHeader className="border-b">
        <SearchInput
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7"
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Blocks ({filtered_block_types.length})</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuGrid>
              {filtered_block_types.map((block_type) => (
                <HoverCard key={block_type} openDelay={100} closeDelay={100}>
                  <HoverCardTrigger>
                    <SidebarMenuGridItem
                      onClick={handleAddBlock.bind(null, block_type)}
                      key={block_type}
                      className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground bg-background"
                    >
                      <BlockTypeIcon
                        type={block_type}
                        className="p-2 size-8 rounded-sm"
                      />
                      <div className="mt-1 w-full text-xs break-words text-center overflow-hidden text-ellipsis">
                        {blocklabels[block_type]}
                      </div>
                    </SidebarMenuGridItem>
                  </HoverCardTrigger>
                </HoverCard>
              ))}
            </SidebarMenuGrid>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Fields ({filtered_field_types.length})</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenuGrid>
              {filtered_field_types.map((field_type) => (
                <HoverCard key={field_type} openDelay={100} closeDelay={100}>
                  <HoverCardTrigger>
                    <SidebarMenuGridItem
                      onClick={handleAddFieldBlock.bind(null, field_type)}
                      key={field_type}
                      className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground bg-background"
                    >
                      <FormFieldTypeIcon
                        type={field_type}
                        className="p-2 size-8 rounded-sm"
                      />
                      <div className="mt-1 w-full text-xs break-words text-center overflow-hidden text-ellipsis">
                        {annotations[field_type].label}
                      </div>
                    </SidebarMenuGridItem>
                  </HoverCardTrigger>
                  <HoverCardContent
                    className="max-w-none w-fit min-w-80"
                    side="right"
                    align="start"
                  >
                    <div className="relative">
                      <div className="flex justify-between items-center">
                        <div>
                          <FormFieldTypeIcon
                            type={field_type}
                            className="inline align-middle me-2 size-8 p-2 border rounded-sm shadow-sm"
                          />
                          <span className="font-bold">
                            {annotations[field_type].label}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleAddFieldBlock.bind(null, field_type)}
                        >
                          <PlusIcon className="inline align-middle me-2 size-4" />
                          Add
                        </Button>
                      </div>
                      <hr className="my-4" />
                      <DummyFormAgentStateProvider>
                        <FormField
                          type={field_type}
                          name={"example"}
                          label={annotations[field_type].label + " Example"}
                          placeholder="Example"
                          helpText="This is an example field"
                          options={[
                            { id: "1", label: "Option 1", value: "option1" },
                            { id: "2", label: "Option 2", value: "option2" },
                            { id: "3", label: "Option 3", value: "option3" },
                          ]}
                          preview
                        />
                      </DummyFormAgentStateProvider>
                    </div>
                  </HoverCardContent>
                </HoverCard>
              ))}
            </SidebarMenuGrid>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </>
  );
}
