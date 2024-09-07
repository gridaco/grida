"use client";

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
import {
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import TextareaAutosize from "react-textarea-autosize";
import { Button } from "@/components/ui/button";
import { useG11nResource } from "@/scaffolds/editor/use";
import { g11nkey } from "@/scaffolds/editor/g11n";

export function HeaderBlock({ id }: { id: string }) {
  const deleteBlock = useDeleteBlock();
  const [focused, setFocus] = useBlockFocus(id);

  const title = useG11nResource(
    g11nkey("block", { id: id, property: "title_html" })
  );

  const description = useG11nResource(
    g11nkey("block", { id: id, property: "description_html" })
  );

  return (
    <FlatBlockBase focused={focused} invalid={false} onPointerDown={setFocus}>
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
        </div>
      </BlockHeader>
      <div>
        <div className="bg-background rounded overflow-hidden border aspect-auto">
          <input
            type="text"
            className="bg-background w-full p-4 text-2xl font-bold outline-none"
            placeholder="Heading"
            value={title.value}
            onChange={(e) => title.change(e.target.value)}
          />
          <TextareaAutosize
            minRows={1}
            className="bg-background w-full p-4 text-lg outline-none"
            placeholder="Description"
            value={description.value}
            onChange={(e) => description.change(e.target.value)}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
