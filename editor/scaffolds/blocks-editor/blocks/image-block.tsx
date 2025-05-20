"use client";

import React, { useCallback } from "react";
import {
  DotsHorizontalIcon,
  ImageIcon,
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
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { AdminMediaPicker } from "@/scaffolds/mediapicker";

export function ImageBlock({
  id,
  type,
  form_field_id,
  src,
  data,
}: EditorFlatFormBlock) {
  const [state, dispatch] = useEditorState();
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [focused, setFocus] = useBlockFocus(id);
  const deleteBlock = useDeleteBlock();

  const onChangeImage = useCallback(
    (src: string) => {
      dispatch({
        type: "blocks/image/src",
        block_id: id,
        src: src,
      });
    },
    [dispatch]
  );

  return (
    <FlatBlockBase invalid={!src} focused={focused} onPointerDown={setFocus}>
      <BlockHeader>
        <div className="flex flex-row items-center gap-8">
          <span className="flex flex-row gap-2 items-center">
            <ImageIcon className="size-3" />
            <span className="text-xs">Image</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  setPickerOpen(true);
                }}
                variant="ghost"
                size="icon"
              >
                <ImageIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Media Picker</TooltipContent>
          </Tooltip>
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
                  Delete Block
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </BlockAction>
        </div>
      </BlockHeader>
      <div>
        <AdminMediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onUseImage={onChangeImage}
        />
        <div className="rounded-sm p-4 overflow-hidden border border-black/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            // width="100%"
            // height="100%"
            src={src || "/assets/placeholder-image.png"}
            alt={data?.alt}
          />
        </div>
      </div>
    </FlatBlockBase>
  );
}
