"use client";

import React, { useCallback, useMemo } from "react";
import { MagnifyingGlassIcon, PlusIcon } from "@radix-ui/react-icons";
import { useEditorState } from "../editor";
import {
  SidebarMenuGrid,
  SidebarMenuGridItem,
  SidebarMenuItem,
  SidebarMenuLink,
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
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { usePathname } from "next/navigation";
import "core-js/features/map/group-by";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/extension/search-input";
import Fuse from "fuse.js";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const pathname = usePathname();

  const {
    document: { pages },
  } = state;

  const sections = Map.groupBy(pages, (page) => page.section);

  return (
    <>
      {Array.from(sections.keys()).map((section) => (
        <SidebarSection key={section}>
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>{section}</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuList>
            {sections.get(section)?.map((page) => (
              <SidebarMenuLink key={page.id} href={page.href ?? ""}>
                <SidebarMenuItem muted level={page.level}>
                  <ResourceTypeIcon
                    type={page.icon}
                    className="w-4 h-4 me-2 inline"
                  />
                  {page.label}
                </SidebarMenuItem>
              </SidebarMenuLink>
              // <Link key={page.id} href={page.href ?? ""}>
              //   <SidebarMenuItem
              //     level={page.level}
              //     selected={pathname === page.href}
              //   >
              //     <ResourceTypeIcon
              //       type={page.icon}
              //       className="w-4 h-4 me-2 inline"
              //     />
              //     {page.label}
              //   </SidebarMenuItem>
              // </Link>
            ))}
          </SidebarMenuList>
        </SidebarSection>
      ))}
    </>
  );
}

export function ModeBlocks() {
  const [search, setSearch] = React.useState("");
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
      label: fieldlabels[field_type],
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
      <SidebarSection className="mt-2">
        <SearchInput
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </SidebarSection>
      <SidebarSection>
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>
            <span>Blocks ({filtered_block_types.length})</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuGrid>
          {filtered_block_types.map((block_type) => (
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
            <span>Fields ({filtered_field_types.length})</span>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuGrid>
          {filtered_field_types.map((field_type) => (
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
    </>
  );
}
