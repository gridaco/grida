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
  BlockAction,
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import dynamic from "next/dynamic";

const ReactPlayer = dynamic(() => import("react-player/lazy"), { ssr: false });

export function VideoBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [focused, setFocus] = useBlockFocus(id);
  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase focused={focused} onPointerDown={setFocus} invalid={!src}>
      <BlockHeader>
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center gap-8">
            <span className="flex flex-row gap-2 items-center">
              <VideoIcon className="size-3" />
              <span className="text-xs">Video</span>
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
        <div className="bg-card rounded overflow-hidden border aspect-video">
          <ReactPlayer width={"100%"} height={"100%"} url={src ?? ""} />
        </div>
      </div>
    </FlatBlockBase>
  );
}
