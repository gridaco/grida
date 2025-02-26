"use client";

import React, { useCallback } from "react";
import { useEditorState, useFormFields } from "../editor";
import { EditorFlatFormBlock } from "../editor/state";
import { FormBlockType, FormFieldDefinition, FormInputType } from "@/types";
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
  StandaloneDocumentEditor,
  type CanvasAction,
} from "@/grida-react-canvas";
import { composeEditorDocumentAction } from "../editor/action";
import { NodeHierarchyList } from "./sidebar-node-hierarchy-list";
import { SidebarMenuGroup } from "./sidebar-menu-group";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";

export function ModeDesign() {
  const [state] = useEditorState();

  const { pages } = state;

  const show_hierarchy =
    state.selected_page_id &&
    // TODO: need typing
    ["form", "site/dev-collection", "form/startpage", "canvas/one"].includes(
      state.selected_page_id
    );

  return (
    <div className="divide-y">
      {pages.length > 0 && (
        <div>
          {pages.map((g, i) => (
            <SidebarMenuGroup key={i} menu={g} />
          ))}
        </div>
      )}
      {show_hierarchy && (
        <div>
          <HierarchyView />
        </div>
      )}
    </div>
  );
}

function HierarchyView() {
  const [state, dispatch] = useEditorState();
  const { selected_page_id, documents } = state;

  const documentDispatch = useCallback(
    (action: CanvasAction) => {
      dispatch(
        composeEditorDocumentAction(
          // @ts-ignore
          selected_page_id,
          action
        )
      );
    },
    [dispatch, selected_page_id]
  );

  // @ts-ignore
  const document = documents[selected_page_id];

  return (
    <SidebarGroup>
      <SidebarGroupLabel>
        <span>Layers</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        {selected_page_id === "form" && <FormBlockHierarchyList />}
        {(selected_page_id === "form/startpage" ||
          selected_page_id === "site/dev-collection" ||
          "canvas/one") &&
          document && (
            // FIXME: redundant
            <StandaloneDocumentEditor
              editable
              initial={document}
              dispatch={documentDispatch}
            >
              <NodeHierarchyList />
            </StandaloneDocumentEditor>
          )}
      </SidebarGroupContent>
    </SidebarGroup>
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
