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
} from "@/components/ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { useEditorState } from "@/scaffolds/editor";
import {
  BlockAction,
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { Button } from "@/components/ui/button";
import { MinimalTiptapHeadlessEditor } from "@/kits/minimal-tiptap";

export function HeaderBlock({
  id,
  title_html,
  description_html,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const deleteBlock = useDeleteBlock();
  const [focused, setFocus] = useBlockFocus(id);

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
    <FlatBlockBase focused={focused} invalid={false} onPointerDown={setFocus}>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <HeadingIcon className="size-3" />
              <span className="text-xs">Header</span>
            </span>
          </div>
        </div>
        <BlockAction>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <DotsHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => deleteBlock(id)}>
                <TrashIcon className="me-2 align-middle" />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BlockAction>
      </BlockHeader>
      <div>
        <div className="px-2 bg-background overflow-hidden aspect-auto">
          <input
            type="text"
            className="bg-background w-full text-2xl font-bold outline-none"
            placeholder="Heading"
            value={title_html ?? ""}
            onChange={(e) => onEditTitle(e.target.value)}
          />
          <MinimalTiptapHeadlessEditor
            output="html"
            className="bg-background w-full outline-none border-none mt-4"
            placeholder="Description"
            value={description_html ?? ""}
            onChange={(value) => onEditDescription((value as string) ?? "")}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
