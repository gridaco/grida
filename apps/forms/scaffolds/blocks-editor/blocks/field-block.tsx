"use client";

import React, { useCallback, useState } from "react";
import {
  DotsHorizontalIcon,
  GearIcon,
  InputIcon,
  MixIcon,
  Pencil1Icon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import {
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState, useFormFields } from "@/scaffolds/editor";
import { FormFieldDefinition } from "@/types";
import Link from "next/link";
import FormFieldPreview from "@/components/formfield";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import clsx from "clsx";
import { editorlink } from "@/lib/forms/url";
import { SYSTEM_GF_KEY_STARTS_WITH } from "@/k/system";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { useG11nResource } from "@/scaffolds/editor/use";
import { g11nkey } from "@/scaffolds/editor/g11n";

export function FieldBlock({
  id,
  type,
  form_field_id,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);

  const {
    form: { available_field_ids },
  } = state;

  const advancedModeDialog = useDialogState();

  const fields = useFormFields();

  const form_field: FormFieldDefinition | undefined = fields.find(
    (f) => f.id === form_field_id
  );

  const is_hidden_field = form_field?.type === "hidden";

  const can_advanced_mode = fields.length > 0;

  const label = useG11nResource(
    g11nkey("field", { id: form_field_id!, property: "label" })
  );

  const placeholder = useG11nResource(
    g11nkey("field", { id: form_field_id!, property: "placeholder" })
  );

  const helptext = useG11nResource(
    g11nkey("field", { id: form_field_id!, property: "help_text" })
  );

  const onFieldChange = useCallback(
    (field_id: string) => {
      dispatch({
        type: "blocks/field/change",
        field_id,
        block_id: id,
      });
    },
    [dispatch, id]
  );

  const onNewFieldClick = useCallback(() => {
    dispatch({
      type: "blocks/field/change",
      block_id: id,
      field_id: null,
    });
    dispatch({
      type: "blocks/field/new",
      block_id: id,
    });
  }, [dispatch, id]);

  return (
    <>
      <AdvancedModeDialog
        {...advancedModeDialog}
        form_field_id={form_field_id!}
        block_id={id}
      />
      <FlatBlockBase
        focused={focused}
        invalid={!form_field}
        onPointerDown={setFocus}
      >
        <BlockHeader border>
          <div className="flex flex-row items-center gap-8">
            <span className="flex flex-row gap-2 items-center">
              <InputIcon />
              {fields.length === 0 ? (
                <>
                  <Button variant="outline" size="sm" onClick={onNewFieldClick}>
                    <PlusIcon className="me-2" />
                    Create Field
                  </Button>
                </>
              ) : (
                <>
                  <Select
                    value={form_field_id ?? ""}
                    onValueChange={(value) => {
                      if (value === "__gf_new") {
                        onNewFieldClick();
                        return;
                      }
                      if (value === "__gf_advanced") {
                        advancedModeDialog.openDialog();
                        return;
                      }
                      onFieldChange(value);
                    }}
                  >
                    <SelectTrigger id="category" aria-label="Select category">
                      <SelectValue placeholder="Select Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.map((f) => (
                        <SelectItem
                          key={f.id}
                          value={f.id}
                          disabled={!available_field_ids.includes(f.id)}
                        >
                          {f.name}
                        </SelectItem>
                      ))}
                      <SelectItem value="__gf_new">
                        <div className="flex items-center">
                          <PlusIcon className="me-2" />
                          Create New Field
                        </div>
                      </SelectItem>
                      {can_advanced_mode && (
                        <SelectItem value="__gf_advanced">
                          <div className="flex items-center">
                            <GearIcon className="me-2" />
                            Advanced
                          </div>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </>
              )}
            </span>
          </div>
          <div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button>
                  <DotsHorizontalIcon />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <FormFieldBlockMenuItems
                  block_id={id}
                  form_field_id={form_field_id}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </BlockHeader>
        <div className={clsx("w-full bg-background rounded px-4 py-10")}>
          {is_hidden_field ? (
            <HiddenFieldInfo data={form_field} />
          ) : (
            <FormFieldPreview
              readonly
              preview
              disabled={!!!form_field}
              name={form_field?.name ?? ""}
              //
              // label={form_field?.label ?? ""}
              // helpText={form_field?.help_text ?? ""}
              // placeholder={form_field?.placeholder ?? ""}
              label={label.value}
              helpText={helptext.value}
              placeholder={placeholder.value}
              //
              type={form_field?.type ?? "text"}
              required={form_field?.required ?? false}
              requiredAsterisk
              pattern={form_field?.pattern ?? ""}
              step={form_field?.step ?? undefined}
              min={form_field?.min ?? undefined}
              max={form_field?.max ?? undefined}
              options={form_field?.options}
              optgroups={form_field?.optgroups}
              multiple={form_field?.multiple ?? false}
              data={form_field?.data}
            />
          )}
        </div>
      </FlatBlockBase>
    </>
  );
}

function HiddenFieldInfo({ data }: { data: FormFieldDefinition }) {
  const [state, dispatch] = useEditorState();
  const { document_id, basepath } = state;

  const onFieldEditClick = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      field_id: data.id,
    });
  }, [dispatch, data.id]);

  return (
    <div>
      <p className="text-xs opacity-50">
        Hidden fields are not displayed in the form.
        <br />
        Configure how this field is populated with{" "}
        <Link
          className="underline"
          href={editorlink("connect/parameters", {
            document_id,
            basepath,
          })}
        >
          URL Parameters
        </Link>{" "}
        {data.required ? "(required)" : ""}{" "}
        {!(
          data.name.startsWith(SYSTEM_GF_KEY_STARTS_WITH) || data.required
        ) && (
          <>
            or{" "}
            <Button
              onClick={onFieldEditClick}
              variant="link"
              className="inline text-xs p-0"
            >
              Edit computed value
            </Button>
          </>
        )}
      </p>
    </div>
  );
}

export function FormFieldBlockMenuItems({
  block_id,
  form_field_id,
}: {
  block_id: string;
  form_field_id?: string | null;
}) {
  const [state, dispatch] = useEditorState();

  const onFieldEditClick = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      field_id: form_field_id!,
    });
  }, [dispatch, form_field_id]);

  const deleteBlock = useDeleteBlock();

  return (
    <>
      {form_field_id && (
        <DropdownMenuItem onClick={onFieldEditClick}>
          <Pencil1Icon className="me-2 align-middle" />
          Edit Field Definition
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => deleteBlock(block_id)}>
        <TrashIcon className="me-2 align-middle" />
        Delete Block
      </DropdownMenuItem>
    </>
  );
}

function AdvancedModeDialog({
  block_id,
  form_field_id,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  block_id: string;
  form_field_id: string;
}) {
  const [state, dispatch] = useEditorState();

  const fields = useFormFields();

  const onFieldChange = useCallback(
    (field_id: string) => {
      dispatch({
        type: "blocks/field/change",
        field_id,
        block_id: block_id,
      });
    },
    [dispatch, block_id]
  );

  return (
    <Dialog {...props}>
      <DialogContent>
        <DialogHeader>Advanced Mode</DialogHeader>
        <DialogDescription>
          In advanced mode, you can re-use already referenced field. This is
          useful when there are multiple blocks that should be visible
          optionally. (Use with caution, only one value will be accepted if
          there are multiple rendered blocks with the same field)
        </DialogDescription>
        <div>
          <Select
            value={form_field_id ?? ""}
            onValueChange={(value) => {
              onFieldChange(value);
            }}
          >
            <SelectTrigger id="category" aria-label="Select category">
              <SelectValue placeholder="Select Field" />
            </SelectTrigger>
            <SelectContent>
              {fields.map((f: FormFieldDefinition) => (
                <SelectItem key={f.id} value={f.id} disabled={false}>
                  {f.name}{" "}
                  <small>
                    {!state.form.available_field_ids.includes(f.id) &&
                      `${(() => {
                        const t = state.blocks.filter(
                          (b) => b.form_field_id === f.id
                        ).length;

                        return `(${t} ${t <= 1 ? "usage" : "usages"})`;
                      })()} 
                            `}
                  </small>
                  <small className="ms-1 font-mono opacity-50">{f.id}</small>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button>OK</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
