"use client";

import React, { useState } from "react";
import { useEditorState } from "../editor";
import {
  SidebarMenuItem,
  SidebarMenuItemActions,
  SidebarMenuLink,
  SidebarMenuList,
  SidebarSection,
  SidebarMenuItemAction,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { ResourceTypeIcon } from "@/components/resource-type-icon";
import { usePathname } from "next/navigation";
import "core-js/features/map/group-by";
import { EditorFlatFormBlock } from "../editor/state";
import { FormBlockType, FormFieldDefinition, FormInputType } from "@/types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormFieldBlockMenuItems } from "../blocks-editor/blocks/field-block";

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
                <SidebarMenuItem
                  muted
                  level={page.level}
                  onSelect={() => {
                    dispatch({
                      type: "editor/document/select-page",
                      page_id: page.id,
                    });
                  }}
                >
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
      {state.document.selected_page_id === "form" && <HierarchyView />}
    </>
  );
}

function HierarchyView() {
  const [state, dispatch] = useEditorState();
  // const [expands, setExpands] = useState<Record<string, boolean>>({});
  const { focus_block_id } = state;

  return (
    <Collapsible defaultOpen>
      <SidebarSection>
        <CollapsibleTrigger className="w-full">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>
              <span>Layers</span>
            </SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuList>
            {state.blocks.map((b) => {
              const selected = focus_block_id === b.id;
              const { label, icon } = blocklabel(b, {
                fields: state.fields,
              });
              return (
                <SidebarMenuItem
                  key={b.id}
                  muted
                  // expandable={b.type === "section"}
                  // expanded={expands[b.id]}
                  // onExpandChange={(expanded) => {
                  //   setExpands((expands) => ({
                  //     ...expands,
                  //     [b.id]: expanded,
                  //   }));
                  // }}
                  level={b.parent_id ? 1 : 0}
                  selected={selected}
                  onSelect={() => {
                    dispatch({
                      type: "blocks/focus",
                      block_id: b.id,
                    });
                  }}
                  icon={
                    <FormHierarchyItemIcon icon={icon} className="w-4 h-4" />
                  }
                >
                  {label}
                  <SidebarMenuItemActions>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuItemAction>
                          <DotsHorizontalIcon />
                        </SidebarMenuItemAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <FormFieldBlockMenuItems
                          block_id={b.id}
                          form_field_id={b.form_field_id}
                        />
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItemActions>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenuList>
        </CollapsibleContent>
      </SidebarSection>
    </Collapsible>
  );
}

function FormHierarchyItemIcon({
  icon: { namespace, type },
  className,
}: {
  className?: string;
  icon:
    | { namespace: "block"; type: FormBlockType }
    | {
        namespace: "field";
        type: FormInputType;
      };
}) {
  switch (namespace) {
    case "block":
      return (
        <BlockTypeIcon type={type as FormBlockType} className={className} />
      );
    case "field":
      return (
        <FormFieldTypeIcon type={type as FormInputType} className={className} />
      );
  }
}

function blocklabel(
  block: EditorFlatFormBlock,
  context: {
    fields: FormFieldDefinition[];
  }
): {
  label: string;
  icon:
    | { namespace: "block"; type: FormBlockType }
    | {
        namespace: "field";
        type: FormInputType;
      };
} {
  switch (block.type) {
    case "field":
      // find field
      const field = context.fields.find((f) => f.id === block.form_field_id);
      return {
        label: field?.name ?? "...",
        icon: {
          namespace: "field",
          type: field?.type ?? "text",
        },
      };
    default:
      return {
        label: block.type,
        icon: {
          namespace: "block",
          type: block.type,
        },
      };
  }
}
