"use client";

import React, { useCallback } from "react";
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
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormFieldBlockMenuItems } from "../blocks-editor/blocks/field-block";
import { renderMenuItems } from "./render";
import { StandaloneDocumentEditor } from "@/builder";
import { BuilderAction } from "@/builder/action";
import { composeEditorDocumentAction } from "../editor/action";
import { NodeHierarchyList } from "./sidebar-node-hierarchy-list";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const { pages } = state;

  const show_hierarchy =
    state.selected_page_id &&
    // TODO: need typing
    ["form", "site/dev-collection", "form/startpage"].includes(
      state.selected_page_id
    );

  return (
    <>
      {renderMenuItems(pages, {
        onSelect: (page) => {
          dispatch({
            type: "editor/select-page",
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
    </>
  );
}

function HierarchyView() {
  const [state, dispatch] = useEditorState();
  const { doctype, selected_page_id, documents } = state;

  const documentDispatch = useCallback(
    (action: BuilderAction) => {
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
            {selected_page_id === "form" && <FormBlockHierarchyList />}
            {(selected_page_id === "form/startpage" ||
              selected_page_id === "site/dev-collection") &&
              document && (
                <StandaloneDocumentEditor
                  state={document}
                  dispatch={documentDispatch}
                >
                  <NodeHierarchyList />
                </StandaloneDocumentEditor>
              )}
          </SidebarMenuList>
        </CollapsibleContent>
      </SidebarSection>
    </Collapsible>
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
