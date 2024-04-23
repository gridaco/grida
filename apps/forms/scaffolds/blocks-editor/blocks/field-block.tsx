"use client";

import React, { useCallback } from "react";
import {
  DotsHorizontalIcon,
  InputIcon,
  Pencil1Icon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { BlockHeader, FlatBlockBase, useDeleteBlock } from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import { FormFieldDefinition } from "@/types";
import Link from "next/link";
import { FormFieldPreview } from "@/components/formfield";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function FieldBlock({
  id,
  type,
  form_field_id,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const form_field: FormFieldDefinition | undefined = state.fields.find(
    (f) => f.id === form_field_id
  );

  const is_hidden_field = form_field?.type === "hidden";

  const { available_field_ids } = state;

  const no_available_fields = available_field_ids.length === 0;

  const can_create_new_field_from_this_block =
    no_available_fields && !form_field;

  const deleteBlock = useDeleteBlock();

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
      type: "blocks/field/new",
      block_id: id,
    });
  }, [dispatch, id]);

  const onEditClick = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      field_id: form_field_id!,
    });
  }, [dispatch, form_field_id]);

  return (
    <FlatBlockBase invalid={!form_field}>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <span className="flex flex-row gap-2 items-center">
            <InputIcon />
            <Select
              value={form_field_id ?? ""}
              onValueChange={(value) => {
                if (value === "__gf_new") {
                  onNewFieldClick();
                  return;
                }
                onFieldChange(value);
              }}
            >
              <SelectTrigger id="category" aria-label="Select category">
                <SelectValue placeholder="Select Field" />
              </SelectTrigger>
              <SelectContent>
                {state.fields.map((f) => (
                  <SelectItem
                    key={f.id}
                    value={f.id}
                    disabled={!available_field_ids.includes(f.id)}
                  >
                    {f.name}
                  </SelectItem>
                ))}
                {can_create_new_field_from_this_block && (
                  <SelectItem value="__gf_new">Create New Field</SelectItem>
                )}
              </SelectContent>
            </Select>
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
              {form_field_id && (
                <DropdownMenuItem onClick={onEditClick}>
                  <Pencil1Icon />
                  Edit Field Definition
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div className="w-full min-h-40 bg-neutral-200 dark:bg-neutral-800 rounded p-10 border border-black/20">
        {is_hidden_field ? (
          <div>
            <p className="text-xs opacity-50">
              Hidden fields are not displayed in the form.
              <br />
              Configure how this field is populated in the form{" "}
              <Link className="underline" href="./settings">
                settings
              </Link>
              .
            </p>
          </div>
        ) : (
          <FormFieldPreview
            readonly
            preview
            disabled={!!!form_field}
            name={form_field?.name ?? ""}
            label={form_field?.label ?? ""}
            type={form_field?.type ?? "text"}
            required={form_field?.required ?? false}
            helpText={form_field?.help_text ?? ""}
            placeholder={form_field?.placeholder ?? ""}
            options={form_field?.options}
            data={form_field?.data}
          />
        )}
      </div>
    </FlatBlockBase>
  );
}
