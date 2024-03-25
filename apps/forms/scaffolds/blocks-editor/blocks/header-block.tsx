"use client";

import { useCallback } from "react";
import {
  DotsHorizontalIcon,
  HeadingIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@editor-ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { useEditorState } from "@/scaffolds/editor";
import { BlockHeader, FlatBlockBase, useDeleteBlock } from "./base-block";

export function HeaderBlock({
  id,
  title_html,
  description_html,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const deleteBlock = useDeleteBlock();

  const onEditTitle = useCallback(
    (title: string) => {
      dispatch({
        type: "blocks/title",
        block_id: id,
        title_html: title,
      });
    },
    [dispatch, id]
  );

  const onEditDescription = useCallback(
    (description: string) => {
      dispatch({
        type: "blocks/description",
        block_id: id,
        description_html: description,
      });
    },
    [dispatch, id]
  );

  return (
    <FlatBlockBase invalid={false}>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <HeadingIcon />
              Header
            </span>
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
          <input
            type="text"
            className="w-full p-4 text-2xl font-bold outline-none"
            placeholder="Heading"
            value={title_html ?? ""}
            onChange={(e) => onEditTitle(e.target.value)}
          />
          <input
            type="text"
            className="w-full p-4 text-lg outline-none"
            placeholder="Description"
            value={description_html ?? ""}
            onChange={(e) => onEditDescription(e.target.value)}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
