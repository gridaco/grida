"use client";

import React from "react";
import { useEditorState, useFormFields } from "../editor";
import {
  SidebarMenuItem,
  SidebarMenuItemActions,
  SidebarMenuList,
  SidebarSection,
  SidebarMenuItemAction,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
  SidebarMenuItemLabel,
} from "@/components/sidebar";
import { EditorFlatFormBlock, MenuItem } from "../editor/state";
import { FormBlockType, FormFieldDefinition, FormInputType } from "@/types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { DotsHorizontalIcon, GlobeIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormFieldBlockMenuItems } from "../blocks-editor/blocks/field-block";
import { renderMenuItems } from "./render";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const {
    document: { pages },
  } = state;

  const show_hierarchy =
    state.document.selected_page_id &&
    ["form", "collection"].includes(state.document.selected_page_id);

  return (
    <>
      {renderMenuItems(pages, {
        onSelect: (page) => {
          dispatch({
            type: "editor/document/select-page",
            page_id: page.id,
          });
        },
      })}

      {show_hierarchy && (
        <>
          <hr />
          <HierarchyView />
        </>
      )}

      {/* WIP */}
      {process.env.NODE_ENV === "development" && <LocalizationView />}
    </>
  );
}

function LocalizationView() {
  return (
    <SidebarSection>
      {/* <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Localization</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem> */}
      <SidebarMenuList>
        <SidebarMenuItem muted className="cursor-default">
          <SidebarMenuItemLabel>
            <GlobeIcon className="w-4 h-4 me-2 inline-flex" />
            Translations
          </SidebarMenuItemLabel>
        </SidebarMenuItem>
        <SidebarMenuItem muted className="cursor-default" level={1}>
          <SidebarMenuItemLabel>
            <span className="inline-flex w-4 h-4 me-2 items-center justify-center">
              🇺🇸
            </span>
            en
          </SidebarMenuItemLabel>
        </SidebarMenuItem>
        <SidebarMenuItem muted className="cursor-default" level={1}>
          <SidebarMenuItemLabel>
            <span className="inline-flex w-4 h-4 me-2 items-center justify-center">
              🇰🇷
            </span>
            ko
          </SidebarMenuItemLabel>
        </SidebarMenuItem>
      </SidebarMenuList>
    </SidebarSection>
  );
}

function FormBlockHierarchyList() {
  const [state, dispatch] = useEditorState();
  const fields = useFormFields();
  // const [expands, setExpands] = useState<Record<string, boolean>>({});
  const { focus_block_id } = state;

  return (
    <>
      {state.blocks.map((b) => {
        const selected = focus_block_id === b.id;
        const { label, icon } = blocklabel(b, {
          fields,
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
            icon={<FormHierarchyItemIcon icon={icon} className="w-4 h-4" />}
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
    </>
  );
}

function SiteLayerHierarchyList() {
  return <></>;
}

function HierarchyView() {
  const [state] = useEditorState();
  const { doctype } = state;

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
            {doctype === "v0_form" && <FormBlockHierarchyList />}
            {doctype === "v0_site" && <SiteLayerHierarchyList />}
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
