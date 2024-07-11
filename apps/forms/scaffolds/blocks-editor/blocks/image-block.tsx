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
  BlockHeader,
  FlatBlockBase,
  useBlockFocus,
  useDeleteBlock,
} from "./base-block";
import { useEditorState } from "@/scaffolds/editor";
import * as Tooltip from "@radix-ui/react-tooltip";
import { useFormMediaUploader } from "@/scaffolds/mediapicker/form-media-uploader";
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
  const uploader = useFormMediaUploader();
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
            <ImageIcon />
            Image
          </span>
        </div>
        <div className="flex gap-2">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={() => {
                  setPickerOpen(true);
                }}
              >
                <ImageIcon />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content>
                <p className="text-xs opacity-50">Media Picker</p>
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
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
        <AdminMediaPicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onUseImage={onChangeImage}
        />
        <div className="rounded p-4 overflow-hidden border border-black/20">
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
