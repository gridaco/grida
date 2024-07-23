"use client";

import React, { useCallback } from "react";
import { PlusIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarMenuItem,
  SidebarMenuList,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { fieldlabels, supported_field_types } from "@/k/supported_field_types";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileIcon } from "lucide-react";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const addBlock = useCallback(
    (block: FormBlockType) => {
      dispatch({
        type: "blocks/new",
        block: block,
      });
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
    },
    [dispatch]
  );

  return (
    <Tabs defaultValue="add">
      <SidebarSectionHeaderItem>
        <TabsList>
          <TabsTrigger value="page">Pages</TabsTrigger>
          <TabsTrigger value="add">Add</TabsTrigger>
        </TabsList>
      </SidebarSectionHeaderItem>
      <TabsContent value="page">
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Pages</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuList>
            {state.document.pages.map((page) => (
              <SidebarMenuItem
                key={page}
                onSelect={() => {
                  dispatch({
                    type: "editor/document/select-page",
                    page_id: page,
                  });
                }}
                selected={state.document.selected_page_id === page}
              >
                <FileIcon className="w-4 h-4 me-2 inline" />
                {page}
              </SidebarMenuItem>
            ))}
          </SidebarMenuList>
        </SidebarSection>
      </TabsContent>
      <TabsContent value="add">
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Blocks</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuGrid>
            {supported_block_types.map((block_type) => (
              <HoverCard key={block_type} openDelay={100} closeDelay={100}>
                <HoverCardTrigger>
                  <SidebarMenuGridItem
                    onClick={addBlock.bind(null, block_type)}
                    key={block_type}
                    className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                  >
                    <BlockTypeIcon
                      type={block_type}
                      className="p-2 w-8 h-8 rounded"
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
                      <PlusIcon className="inline align-middle me-2 w-4 h-4" />
                      Add
                    </Button>
                  </div>
                  <hr className="my-4" />
                </div>
              </HoverCardContent> */}
              </HoverCard>
            ))}
          </SidebarMenuGrid>
        </SidebarSection>
        <SidebarSection>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Fields</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuGrid>
            {supported_field_types.map((field_type) => (
              <HoverCard key={field_type} openDelay={100} closeDelay={100}>
                <HoverCardTrigger>
                  <SidebarMenuGridItem
                    onClick={addFieldBlock.bind(null, field_type)}
                    key={field_type}
                    className="border rounded-md shadow-sm cursor-pointer text-foreground/50 hover:text-foreground"
                  >
                    <FormFieldTypeIcon
                      type={field_type}
                      className="p-2 w-8 h-8 rounded"
                    />
                    <div className="mt-1 w-full text-xs break-words text-center overflow-hidden text-ellipsis">
                      {fieldlabels[field_type]}
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
                          className="inline align-middle me-2 w-8 h-8 p-2 border rounded shadow-sm"
                        />
                        <span className="font-bold">
                          {fieldlabels[field_type]}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={addFieldBlock.bind(null, field_type)}
                      >
                        <PlusIcon className="inline align-middle me-2 w-4 h-4" />
                        Add
                      </Button>
                    </div>
                    <hr className="my-4" />
                    <FormField
                      type={field_type}
                      name={"example"}
                      label={fieldlabels[field_type] + " Example"}
                      placeholder="Example"
                      helpText="This is an example field"
                      options={[
                        { id: "1", label: "Option 1", value: "option1" },
                        { id: "2", label: "Option 2", value: "option2" },
                        { id: "3", label: "Option 3", value: "option3" },
                      ]}
                      preview
                    />
                  </div>
                </HoverCardContent>
              </HoverCard>
            ))}
          </SidebarMenuGrid>
        </SidebarSection>
      </TabsContent>
    </Tabs>
  );
}
