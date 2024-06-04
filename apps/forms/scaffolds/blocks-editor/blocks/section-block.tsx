"use client";

import {
  DotsHorizontalIcon,
  SectionIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { BlockHeader, useDeleteBlock } from "./base-block";
import { useEditorState } from "@/scaffolds/editor";

export function SectionBlock({ id }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();

  const deleteBlock = useDeleteBlock();

  const sections = state.blocks
    .filter((block) => block.type === "section")
    .sort((a, b) => a.local_index - b.local_index);
  const index = sections.findIndex((section) => section.id === id);

  return (
    <div>
      <div className="p-4 rounded-md border-black dark:border-white/50 border-2 bg-white dark:bg-neutral-900 shadow-md">
        <BlockHeader>
          <span className="flex flex-row gap-2 items-center">
            <SectionIcon />
            <span>
              Section {"("}
              {index + 1} of {sections.length}
              {")"}
            </span>
          </span>
          <div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <DotsHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => deleteBlock(id)}>
                  <TrashIcon className="me-2 align-middle" />
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
