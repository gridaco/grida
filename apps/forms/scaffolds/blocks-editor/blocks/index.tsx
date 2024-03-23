import { FormFieldPreview } from "@/components/formfield";
import type { EditorFlatFormBlock } from "../../editor/state";
import { useEditorState } from "../../editor/provider";
import { FormFieldDefinition } from "@/types";
import {
  CodeIcon,
  DotsHorizontalIcon,
  DragHandleHorizontalIcon,
  ImageIcon,
  InputIcon,
  Pencil1Icon,
  SectionIcon,
  TextIcon,
  TrashIcon,
  VideoIcon,
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
import cs from "classnames";
import dynamic from "next/dynamic";
import { Editor } from "@monaco-editor/react";
import Link from "next/link";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

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

export function Block(props: EditorFlatFormBlock) {
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
    disabled: props.type === "section",
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: isDragging ? 1 : 0,
    transition,
  };

  function renderBlock() {
    switch (props.type) {
      case "section":
        return <SectionBlock {...props} />;
      case "field":
        return <FieldBlock {...props} />;
      case "html":
        return <HtmlBlock {...props} />;
      case "image":
        return <ImageBlock {...props} />;
      case "video":
        return <VideoBlock {...props} />;
      default:
        return <div>Unsupported block type: {props.type}</div>;
    }
  }

  return (
    <>
      {/* debug display */}
      {/* <div className="text-xs border p-1">
        <div className="flex flex-col gap-3">
          <span>id: {props.id}</span>
          <span>parent: {props.parent_id}</span>
          <span>index: {props.local_index}</span>
        </div>
      </div> */}
      <div
        data-folder={props.type === "section"}
        ref={setNodeRef}
        style={style}
        className="relative data-[folder='true']:mt-16 data-[folder='true']:mb-4"
      >
        <button
          style={{
            display: props.type === "section" ? "none" : "block",
          }}
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

function useDeleteBlock() {
  const [state, dispatch] = useEditorState();
  const supabase = createClientClient();

  const deleteBlock = useCallback(
    async (id: string) => {
      return await supabase.from("form_block").delete().eq("id", id);
    },
    [supabase]
  );

  return useCallback(
    (id: string) => {
      console.log("delete block", id);
      const deletion = deleteBlock(id).then(({ error }) => {
        if (error) {
          throw new Error("Failed to delete block");
        }
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
    },
    [deleteBlock, dispatch]
  );
}

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

  const { available_field_ids } = state;

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
            <select
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
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
    </FlatBlockBase>
  );
}

export function SectionBlock({ id }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  return (
    <div>
      <div className="p-4 rounded-md border-black border-2 bg-white shadow-md">
        <BlockHeader>
          <span className="flex flex-row gap-2 items-center">
            <SectionIcon />
            <span>Section</span>
          </span>
          <div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <button>
                  <DotsHorizontalIcon />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => deleteBlock(id)}>
                  <TrashIcon />
                  Delete Section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </BlockHeader>
      </div>
    </div>
  );
}

function BlockHeader({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex w-full justify-between items-center gap-4">
      {children}
    </div>
  );
}

function FlatBlockBase({
  invalid,
  children,
}: React.PropsWithChildren<{
  invalid?: boolean;
}>) {
  return (
    <div
      data-invalid={invalid}
      className={cs(
        "rounded-md flex flex-col gap-4 border w-full p-4 bg-white shadow-md",
        'data-[invalid="true"]:border-red-500/50 data-[invalid="true"]:bg-red-500/10'
      )}
    >
      {children}
    </div>
  );
}

export function ImageBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase invalid>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <span className="flex flex-row gap-2 items-center">
            <ImageIcon />
            Image
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
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            width="100%"
            height="100%"
            src={src || "/assets/placeholder-image.png"}
            alt={data?.alt}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}

export function VideoBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase invalid>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <span className="flex flex-row gap-2 items-center">
            <VideoIcon />
            Video
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
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-video">
          <ReactPlayer
            width={"100%"}
            height={"100%"}
            url={
              src
                ? src
                : "https://www.youtube.com/watch?v=BFhp7Y0iLSA&ab_channel=AbstractMotion"
            }
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}

export function HtmlBlock({ id }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase invalid>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <CodeIcon />
              HTML Block
            </span>
            <p className="text-xs opacity-50">
              By default, the content will be styled with{" "}
              <a
                className="underline"
                href="https://github.com/tailwindlabs/tailwindcss-typography"
                target="_blank"
              >
                tailwind prose
              </a>{" "}
              style. you don&apos;t need to add styles in most cases. This will
              NOT rendered in iframe. Consider using embed block for dynamic
              content.
            </p>
          </div>
        </div>
        <div>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button>
                <DotsHorizontalIcon />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </BlockHeader>
      <div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-auto">
          <Editor
            height={400}
            defaultLanguage="html"
            defaultValue={
              //
              `<h1>Title</h1>
<p>Description</p>`
            }
            options={{
              padding: { top: 10, bottom: 10 },
              minimap: { enabled: false },
            }}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
