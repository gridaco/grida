"use client";

import React, { useCallback, useMemo } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { useEditorState } from "@/scaffolds/editor";
import { SidebarMenuGrid, SidebarMenuGridItem } from "@/components/sidebar";
import { supported_field_types, annotations } from "@/k/supported_field_types";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import FormField from "@/components/formfield/form-field";
import { Button } from "@/components/ui/button";
import { blocklabels, supported_block_types } from "@/k/supported_block_types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import type { FormBlockType, FormInputType } from "@/types";
import { SearchInput } from "@/components/extension/search-input";
import { DummyFormAgentStateProvider } from "@/lib/formstate";
import Fuse from "fuse.js";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";

export function ModeInsertBlocks() {
  const [search, setSearch] = React.useState("");
  const [state, dispatch] = useEditorState();

  const close = useCallback(() => {
    dispatch({
      type: "editor/panels/insert-menu",
      open: false,
    });
  }, [dispatch]);

  const addBlock = useCallback(
    (block: FormBlockType) => {
      dispatch({
        type: "blocks/new",
        block: block,
      });
      close();
    },
    [dispatch]
  );

  const addFieldBlock = useCallback(
    (type: FormInputType) => {
      dispatch({
        type: "blocks/new",
        block: "field",
        init: {
          type: type,
        },
      });
      close();
    },
    [dispatch]
  );

  const blockFuse = useMemo(() => {
    const blockData = supported_block_types.map((block_type) => ({
      type: block_type,
      label: blocklabels[block_type],
    }));
    return new Fuse(blockData, { keys: ["label"] });
  }, []);

  const fieldFuse = useMemo(() => {
    const fieldData = supported_field_types.map((field_type) => ({
      type: field_type,
      label: annotations[field_type].label,
    }));
    return new Fuse(fieldData, { keys: ["label"] });
  }, []);

  const filtered_block_types = useMemo(() => {
    if (search.trim() === "") {
      return supported_block_types;
    }
    const results = blockFuse.search(search);
    return results.map((result) => result.item.type);
  }, [search, blockFuse]);

  const filtered_field_types = useMemo(() => {
    if (search.trim() === "") {
      return supported_field_types;
    }
    const results = fieldFuse.search(search);
    return results.map((result) => result.item.type);
  }, [search, fieldFuse]);

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
                      onClick={addBlock.bind(null, block_type)}
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
                  {/* <HoverCardContent
                className="max-w-none w-fit min-w-80"
                side="right"
                align="start"
              >
                <div className="relative">
                  <div className="flex justify-between items-center">
                    <span className="font-bold">{blocklabels[block_type]}</span>
                    <Button size="sm" variant="outline">
                      <PlusIcon className="inline align-middle size-4" />
                      Add
                    </Button>
                  </div>
                  <hr className="my-4" />
                </div>
              </HoverCardContent> */}
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
                      onClick={addFieldBlock.bind(null, field_type)}
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
                          onClick={addFieldBlock.bind(null, field_type)}
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
