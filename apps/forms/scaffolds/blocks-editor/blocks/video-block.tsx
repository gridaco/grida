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
} from "@editor-ui/dropdown-menu";
import { EditorFlatFormBlock } from "@/scaffolds/editor/state";
import { BlockHeader, FlatBlockBase, useDeleteBlock } from "./base-block";
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

  const deleteBlock = useDeleteBlock();

  return (
    <FlatBlockBase invalid={!src}>
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
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            placeholder="Video URL"
          />
        </div>
        <div className="bg-neutral-200 rounded overflow-hidden border border-black/20 aspect-video">
          <ReactPlayer width={"100%"} height={"100%"} url={src ?? ""} />
        </div>
      </div>
    </FlatBlockBase>
  );
}
