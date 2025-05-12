"use client";

import {
  DividerHorizontalIcon,
  DotsHorizontalIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import {
  BlockAction,
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { Button } from "@/components/ui/button";

export function DividerBlock({ id }: EditorFlatFormBlock) {
  const [focused, setFocus] = useBlockFocus(id);
  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase focused={focused} onPointerDown={setFocus}>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <div className="flex flex-col gap-1">
            <span className="flex flex-row gap-2 items-center">
              <DividerHorizontalIcon className="size-3" />
              <span className="text-xs">Divider</span>
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
                <TrashIcon className="size-3.5" />
                Delete Block
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BlockAction>
      </BlockHeader>
      <div>
        <div className="bg-neutral-200 rounded-sm overflow-hidden border border-black/20 aspect-auto">
          <hr />
        </div>
      </div>
    </FlatBlockBase>
  );
}
