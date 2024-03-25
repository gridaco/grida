"use client";

import React from "react";
import {
  DotsHorizontalIcon,
  ImageIcon,
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
    <FlatBlockBase>
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
        <div className="rounded p-4 overflow-hidden border border-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            // width="100%"
            // height="100%"
            src={src || "/assets/placeholder-image.png"}
            alt={data?.alt}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
