import { FormFieldPreview } from "@/components/formfield";
import type { EditorFormBlock } from "../../editor/state";
import { useEditorState } from "../../editor/provider";
import { FormFieldDefinition } from "@/types";
import {
  DotsHorizontalIcon,
  DragHandleHorizontalIcon,
  InputIcon,
  Pencil1Icon,
  SectionIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import React, { useCallback } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { createClientClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

export function BlocksCanvas({
  children,
  ...props
}: React.PropsWithChildren<React.HtmlHTMLAttributes<HTMLDivElement>>) {
  const { setNodeRef } = useDroppable({
    id: "root",
  });

  return (
    <div ref={setNodeRef} {...props}>
      {children}
    </div>
  );
}

export function Block(props: React.PropsWithChildren<EditorFormBlock>) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isSorting,
    isOver,
    transition,
  } = useSortable({
    id: props.id,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1 : 0,
    transition,
  };

  function renderBlock() {
    switch (props.type) {
      case "section":
        return <SectionBlock {...props}>{props.children}</SectionBlock>;
      case "field":
        return <FieldBlock {...props} />;
    }
  }

  return (
    <>
      <div
        data-folder={props.type === "section"}
        ref={setNodeRef}
        style={style}
        className="relative data-[folder='true']:mt-16 data-[folder='true']:mb-4"
      >
        <button
          ref={setActivatorNodeRef}
          {...listeners}
          {...attributes}
          className="absolute -left-8 top-1 bg-white rounded border shadow p-1"
        >
          <DragHandleHorizontalIcon />
        </button>
        {renderBlock()}
      </div>
    </>
  );
}

export function FieldBlock({ id, type, form_field_id, data }: EditorFormBlock) {
  const [state, dispatch] = useEditorState();

  const form_field: FormFieldDefinition | undefined = state.fields.find(
    (f) => f.id === form_field_id
  );

  const { available_field_ids } = state;

  const supabase = createClientClient();

  const deleteBlock = useCallback(
    async (id: string) => {
      await supabase.from("form_block").delete().eq("id", id);
    },
    [supabase]
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

  const onDelete = useCallback(() => {
    console.log("delete block", id);
    const deletion = deleteBlock(id).then(() => {
      dispatch({
        type: "blocks/delete",
        block_id: id,
      });
    });

    toast.promise(deletion, {
      loading: "Deleting block...",
      success: "Block deleted",
      error: "Failed to delete block",
    });
  }, [deleteBlock, dispatch, id]);

  const onEditClick = useCallback(() => {
    dispatch({
      type: "editor/field/edit",
      field_id: form_field_id!,
    });
  }, [dispatch, form_field_id]);

  return (
    <div className="rounded-md flex flex-col gap-4 border w-full p-4 bg-white shadow-md">
      <div className="flex w-full justify-between items-center">
        <div className="flex flex-row items-center gap-8">
          <span className="flex flex-row gap-2 items-center">
            <InputIcon />
            <span className="capitalize">{type}</span>
          </span>
          <select
            value={form_field_id ?? ""}
            onChange={(e) => {
              onFieldChange(e.target.value);
            }}
          >
            <option value="">Select Field</option>
            {state.fields.map((f) => (
              <option
                key={f.id}
                value={f.id}
                disabled={!available_field_ids.includes(f.id)}
              >
                {f.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button>
                <DotsHorizontalIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={onDelete}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
              {form_field_id && (
                <DropdownMenuItem onClick={onEditClick}>
                  <Pencil1Icon />
                  Edit Field
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="w-full min-h-40 bg-neutral-200 rounded p-10 border border-black/20">
        <FormFieldPreview
          readonly
          disabled={!!!form_field}
          name={form_field?.name ?? ""}
          label={form_field?.label ?? ""}
          type={form_field?.type ?? "text"}
          required={form_field?.required ?? false}
          helpText={form_field?.help_text ?? ""}
          placeholder={form_field?.placeholder ?? ""}
          options={form_field?.options}
        />
      </div>
    </div>
  );
}

export function SectionBlock({
  children,
  ...props
}: React.PropsWithChildren<EditorFormBlock>) {
  const { setNodeRef, isOver } = useDroppable({
    id: props.id,
  });

  return (
    <div>
      <div className="p-4 rounded-md border bg-white shadow-md">
        <span className="flex flex-row gap-2 items-center">
          <SectionIcon />
          <span>Section</span>
        </span>
      </div>
      <div
        data-over={isOver}
        ref={setNodeRef}
        className="min-h-64 m-4 rounded bg-neutral-500/5 data-[over='true']:bg-blue-500/10"
      >
        {children}
      </div>
    </div>
  );
}
