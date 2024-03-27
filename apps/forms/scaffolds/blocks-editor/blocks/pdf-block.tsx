"use client";

import { useCallback, useState } from "react";
import {
  DotsHorizontalIcon,
  ReaderIcon,
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
import { PDFViewer } from "@/components/pdf-viewer";

export function PdfBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase invalid={!src}>
      <BlockHeader>
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center gap-8">
            <span className="flex flex-row gap-2 items-center">
              <ReaderIcon />
              PDF
            </span>
          </div>
          <p className="text-xs opacity-50">Embed pdf from URL.</p>
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
        <div className="py-4">
          <input
            type="text"
            value={src ?? ""}
            onChange={(e) => {
              dispatch({
                type: "blocks/video/src",
                block_id: id,
                src: e.target.value,
              });
            }}
            className="bg-neutral-50 border border-neutral-300 text-neutral-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-neutral-700 dark:border-neutral-600 dark:placeholder-neutral-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            placeholder="Video URL"
          />
        </div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-video">
          <PDFViewer file={src ?? ""} />
        </div>
      </div>
    </FlatBlockBase>
  );
}
