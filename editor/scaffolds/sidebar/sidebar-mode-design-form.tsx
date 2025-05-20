"use client";

import React from "react";
import { useEditorState, useFormFields } from "../editor";
import { EditorFlatFormBlock } from "../editor/state";
import type {
  FormFieldDefinition,
  FormBlockType,
  FormInputType,
} from "@/grida-forms-hosted/types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormFieldBlockMenuItems } from "../blocks-editor/blocks/field-block";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";
import { SidebarMenuGroup } from "./sidebar-menu-group";

export function ModeDesignForm() {
  const [state] = useEditorState();

  const { pages } = state;

  return (
    <div className="divide-y">
      {pages.length > 0 && (
        <div>
          {pages.map((g, i) => (
            <SidebarMenuGroup key={i} menu={g} />
          ))}
        </div>
      )}

      <SidebarGroup>
        <SidebarGroupLabel>Layers</SidebarGroupLabel>
        <SidebarGroupContent>
          <FormBlockHierarchyList />
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}

function FormBlockHierarchyList() {
  const [state, dispatch] = useEditorState();
  const fields = useFormFields();
  const { focus_block_id } = state;

  return (
    <SidebarMenu>
      {state.blocks.map((b) => {
        const selected = focus_block_id === b.id;
        const { label, icon } = blocklabel(b, {
          fields,
        });
        return (
          <SidebarMenuItem key={b.id}>
            <SidebarMenuButton
              size="sm"
              isActive={selected}
              onClick={() => {
                dispatch({
                  type: "blocks/focus",
                  block_id: b.id,
                });
              }}
              data-level={b.parent_id ? 1 : 0}
              className="data-[level=1]:!ps-4"
            >
              <FormHierarchyItemIcon icon={icon} className="size-4" />
              {label}
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction showOnHover>
                  <DotsHorizontalIcon />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <FormFieldBlockMenuItems
                  block_id={b.id}
                  form_field_id={b.form_field_id}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
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
