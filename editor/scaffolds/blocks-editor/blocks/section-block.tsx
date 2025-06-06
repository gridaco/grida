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
import {
  BlockAction,
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";

export function SectionBlock({ id }: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);
  const deleteBlock = useDeleteBlock();

  const sections = state.blocks
    .filter((block) => block.type === "section")
    .sort((a, b) => a.local_index - b.local_index);
  const index = sections.findIndex((section) => section.id === id);

  return (
    <FlatBlockBase focused={focused} onPointerDown={setFocus}>
      <BlockHeader>
        <span className="flex flex-row gap-2 items-center">
          <SectionIcon />
          <span>
            Section {"("}
            {index + 1} of {sections.length}
            {")"}
          </span>
        </span>
        <BlockAction>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <DotsHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => deleteBlock(id)}
              >
                <TrashIcon className="size-3.5" />
                Delete Section
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BlockAction>
      </BlockHeader>
    </FlatBlockBase>
  );
}
