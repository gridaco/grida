"use client";

import { useCallback } from "react";
import {
  CodeIcon,
  DotsHorizontalIcon,
  SectionIcon,
  TrashIcon,
  VideoIcon,
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
