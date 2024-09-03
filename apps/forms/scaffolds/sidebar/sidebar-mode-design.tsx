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
import {
  FormBlockType,
  FormFieldDefinition,
  FormInputType,
  LanguageCode,
} from "@/types";
import { BlockTypeIcon } from "@/components/form-blcok-type-icon";
import { FormFieldTypeIcon } from "@/components/form-field-type-icon";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DotsHorizontalIcon,
  GlobeIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormFieldBlockMenuItems } from "../blocks-editor/blocks/field-block";
import { renderMenuItems } from "./render";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { AddNewLanguageDialog } from "../dialogs/langs-add-dialog";
import { Badge } from "@/components/ui/badge";
import {
  DeleteConfirmationAlertDialog,
  useDeleteConfirmationAlertDialogState,
} from "@/components/delete-confirmation-dialog";
import { LanguagesIcon } from "lucide-react";

export function ModeDesign() {
  const [state, dispatch] = useEditorState();

  const {
    document: { pages },
  } = state;

  const show_tools =
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

      {/* WIP */}
      {process.env.NODE_ENV === "development" && show_tools && (
        <LocalizationView />
      )}

      {show_tools && (
        <>
          <hr />
          <HierarchyView />
        </>
      )}
    </>
  );
}

function LocalizationView() {
  const [state, dispatch] = useEditorState();
  const addnewlangDialog = useDialogState("addnewlang", { refreshkey: true });
  const deleteConfirmationDialog =
    useDeleteConfirmationAlertDialogState<LanguageCode>("deleteconfirmation", {
      refreshkey: true,
    });

  const { lang, lang_default, langs } = state.document;

  const ismultilang = langs.length > 1;

  const switchLang = useCallback(
    (lang: LanguageCode) => {
      dispatch({
        type: "editor/document/langs/set-current",
        lang: lang,
      });
    },
    [dispatch]
  );

  const switchDefaultLang = useCallback(
    (lang: LanguageCode) => {
      dispatch({
        type: "editor/document/langs/set-default",
        lang: lang,
      });
    },
    [dispatch]
  );

  const deleteLang = useCallback(
    (lang: LanguageCode) => {
      dispatch({
        type: "editor/document/langs/delete",
        lang,
      });
    },
    [dispatch]
  );

  if (!ismultilang) {
    return <></>;
  }

  return (
    <>
      <AddNewLanguageDialog
        {...addnewlangDialog}
        key={addnewlangDialog.refreshkey}
      />
      <DeleteConfirmationAlertDialog<LanguageCode>
        {...deleteConfirmationDialog}
        key={deleteConfirmationDialog.refreshkey}
        onDelete={async ({ id }) => {
          deleteLang(id);
          return true;
        }}
      />
      <SidebarSection>
        {/* <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Localization</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem> */}
        <SidebarMenuList>
          <SidebarMenuItem muted className="cursor-default">
            <SidebarMenuItemLabel>
              <GlobeIcon className="w-4 h-4 me-2 inline-flex" />
              Languages
              <SidebarMenuItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <SidebarMenuItemAction>
                      <DotsHorizontalIcon />
                    </SidebarMenuItemAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onSelect={addnewlangDialog.openDialog}>
                      <GlobeIcon className="inline-flex w-4 h-4 me-2 align-middle" />
                      Add Language
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SidebarMenuItemActions>
            </SidebarMenuItemLabel>
          </SidebarMenuItem>
          {langs.map((l) => {
            const isdefault = l === lang_default;
            const isselected = l === lang;
            return (
              <SidebarMenuItem
                key={l}
                muted
                className="cursor-default"
                level={1}
                selected={isselected}
                onSelect={() => switchLang(l)}
              >
                <SidebarMenuItemLabel>
                  {/* <span className="inline-flex w-4 h-4 me-2 items-center justify-center">
                🇺🇸
              </span> */}
                  {l}{" "}
                  {isdefault && (
                    <Badge
                      variant="outline"
                      className="ms-2 font-normal text-muted-foreground"
                    >
                      default
                    </Badge>
                  )}
                  <SidebarMenuItemActions>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuItemAction>
                          <DotsHorizontalIcon />
                        </SidebarMenuItemAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem
                          onSelect={() => {
                            // TODO:
                            alert("open in translate");
                          }}
                        >
                          <LanguagesIcon className="inline-flex w-4 h-4 me-2 align-middle" />
                          Open in Translate
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          disabled={isdefault}
                          onSelect={() => switchDefaultLang(l)}
                        >
                          <GlobeIcon className="inline-flex w-4 h-4 me-2 align-middle" />
                          Set as Default
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          disabled={isdefault}
                          onSelect={() =>
                            deleteConfirmationDialog.openDialog({
                              id: l,
                              title: "DELETE " + l,
                              description: `Are you sure you want to delete the language "${l}"? This action cannot be undone.`,
                              match: "DELETE " + l,
                            })
                          }
                        >
                          <TrashIcon className="inline-flex w-4 h-4 me-2 align-middle" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItemActions>
                </SidebarMenuItemLabel>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenuList>
      </SidebarSection>
    </>
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
