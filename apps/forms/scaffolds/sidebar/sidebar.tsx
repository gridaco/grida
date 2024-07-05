"use client";

import React, { useCallback } from "react";
import { AvatarIcon, PieChartIcon, PlusIcon } from "@radix-ui/react-icons";
import Link from "next/link";
import { useEditorState } from "../editor";
import { Table2Icon, TabletSmartphoneIcon } from "lucide-react";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarMenuItem,
  SidebarMenuList,
  SidebarRoot,
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

export function Siebar({ mode }: { mode: "data" | "blocks" }) {
  const [state] = useEditorState();

  const { form_id } = state;
  return (
    <SidebarRoot>
      <div className="h-10" />
      {mode === "data" && <ModeData />}
      {mode === "blocks" && <ModeBlocks />}
    </SidebarRoot>
  );
}

function ModeData() {
  const [state] = useEditorState();

  const { form_id } = state;

  return (
    <>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Table</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/data/responses`}>
            <SidebarMenuItem muted>
              <Table2Icon className="inline align-middle w-4 h-4 me-2" />
              Form
            </SidebarMenuItem>
          </Link>
          <Link href={`/d/${form_id}/data/customers`}>
            <SidebarMenuItem muted>
              <AvatarIcon className="inline align-middle w-4 h-4 me-2" />
              Customers
            </SidebarMenuItem>
          </Link>
          {/* <li>
          <Link href={`/d/${form_id}/data/files`}>
            <SideNavItem>
              <FileIcon className="w-4 h-4" />
              Files
            </SideNavItem>
          </Link>
        </li> */}
        </SidebarMenuList>
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>App / Campaign</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/blocks`}>
            <SidebarMenuItem muted>
              <TabletSmartphoneIcon className="inline align-middle w-4 h-4 me-2" />
              Main
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
      {/* <label className="text-xs text-muted-foreground py-4 px-4">
          Commerce
        </label>
        <li>
          <Link href={`/d/${form_id}/connect/store/orders`}>
            <SideNavItem>
              <ArchiveIcon />
              Orders
            </SideNavItem>
          </Link>
        </li>
        <li>
          <Link href={`/d/${form_id}/connect/store/products`}>
            <SideNavItem>
              <ArchiveIcon />
              Inventory
            </SideNavItem>
          </Link>
        </li> */}
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Analytics</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuList>
          <Link href={`/d/${form_id}/data/analytics`}>
            <SidebarMenuItem muted>
              <PieChartIcon className="inline align-middle w-4 h-4 me-2" />
              Realtime
            </SidebarMenuItem>
          </Link>
        </SidebarMenuList>
      </SidebarSection>
    </>
  );
}

function ModeBlocks() {
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
    (field: FormInputType) => addBlock("field"),
    [addBlock]
  );

  return (
    <>
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
                  className="border rounded-md shadow-sm cursor-pointer text-muted-foreground hover:text-foreground"
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
            <span>Inputs</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuGrid>
          {supported_field_types.map((field_type) => (
            <HoverCard key={field_type} openDelay={100} closeDelay={100}>
              <HoverCardTrigger>
                <SidebarMenuGridItem
                  onClick={addFieldBlock.bind(null, field_type)}
                  key={field_type}
                  className="border rounded-md shadow-sm cursor-pointer text-muted-foreground hover:text-foreground"
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
                    <span className="font-bold">{fieldlabels[field_type]}</span>
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
    </>
  );
}
