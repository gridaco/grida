"use client";

import { useCallback } from "react";
import {
  CodeIcon,
  DotsHorizontalIcon,
  TrashIcon,
  VideoIcon,
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
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import dynamic from "next/dynamic";
import { Input } from "@/components/ui/input";
import { g11nkey, useG11nResource } from "@/scaffolds/editor/use";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

export function VideoBlock({
  id,
  type,
  form_field_id,
  // src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);
  const deleteBlock = useDeleteBlock();

  const src = useG11nResource(g11nkey("block", { id: id, property: "src" }));

  return (
    <FlatBlockBase focused={focused} onPointerDown={setFocus} invalid={!src}>
      <BlockHeader>
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center gap-8">
            <span className="flex flex-row gap-2 items-center">
              <VideoIcon />
              Video
            </span>
          </div>
          <p className="text-xs opacity-50">
            Embed video from URL. Supports YouTube, Vimeo, SoundCloud and{" "}
            <a
              className="underline"
              href="https://www.npmjs.com/package/react-player#supported-media"
              target="_blank"
            >
              Others
            </a>
            .
          </p>
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
        <div className="py-4">
          <Input
            name="src"
            type="url"
            value={src.value ?? ""}
            onChange={(e) => {
              src.change(e.target.value || undefined);
            }}
            placeholder="Video URL"
          />
        </div>
        <div className="bg-card rounded overflow-hidden border aspect-video">
          <ReactPlayer width={"100%"} height={"100%"} url={src.value ?? ""} />
        </div>
      </div>
    </FlatBlockBase>
  );
}
