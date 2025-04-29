"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpIcon, ImageUpIcon } from "lucide-react";
import { useFilePicker } from "use-file-picker";
import { Cross2Icon } from "@radix-ui/react-icons";
import { cn } from "@/utils/cn";
import type { FileIO } from "@/lib/file";
import Image from "next/image";
import TextareaAutoResize from "react-textarea-autosize";
import toast from "react-hot-toast";

type Attachment = {
  type: "file" | "image";
  filename?: string;
  mimeType: string;
  url: string;
};

export function ChatBox({
  disabled,
  onValueCommit,
  uploader,
  placeeholder = "Chat with your prompt...",
  className,
  accept,
}: {
  disabled?: boolean;
  onValueCommit?: (value: { text: string; attachments: Attachment[] }) => void;
  uploader?: FileIO.BucketFileUploaderFn;
  placeeholder?: string;
  className?: string;
  accept?: string;
}) {
  const [attatchment, setAttachment] = React.useState<Attachment>();

  const { plainFiles, openFilePicker } = useFilePicker({
    accept: accept,
    multiple: false,
  });

  const acceptsImage = accept?.includes("image/") ?? false;

  useEffect(
    () => {
      if (plainFiles.length === 1) {
        const file = plainFiles[0];
        const task = uploader?.(file).then((result) => {
          setAttachment({
            type: "image",
            filename: file.name,
            mimeType: file.type,
            url: result.publicUrl,
          });
        });

        if (task) {
          toast.promise(task, {
            loading: "Uploading...",
            success: "Uploaded",
            error: "Failed to upload",
          });
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [plainFiles]
  );

  const [txt, setTxt] = React.useState<string>("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const clear = () => {
    setTxt("");
    setAttachment(undefined);
  };

  const onSubmit = () => {
    if (disabled) return;
    onValueCommit?.({
      text: txt,
      attachments: attatchment ? [attatchment] : [],
    });
    clear();
  };

  const onClearAttachments = () => {
    setAttachment(undefined);
  };

  return (
    <div
      className={cn(
        "w-full flex flex-col rounded-xl border border-input bg-muted cursor-text",
        className
      )}
      onClick={() => textareaRef.current?.focus()}
    >
      {attatchment && (
        <div className="flex mb-2">
          <div className="relative">
            <Image
              src={attatchment.url}
              alt={attatchment.filename ?? ""}
              width={256}
              height={256}
              className="max-h-32 aspect-square w-auto object-cover border rounded-md"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={onClearAttachments}
              className="absolute top-1 right-1 rounded-full p-1 w-auto h-auto"
            >
              <Cross2Icon className="size-3" />
            </Button>
          </div>
        </div>
      )}
      <TextareaAutoResize
        ref={textareaRef}
        placeholder={placeeholder}
        maxRows={10}
        className="resize-none border-none outline-none bg-transparent text-sm p-4"
        value={txt}
        onChange={(e) => setTxt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
      <div className="flex items-center justify-between mt-2 px-4 pb-4">
        <div className="flex-1 flex items-center gap-2">
          {acceptsImage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={openFilePicker}
            >
              <ImageUpIcon className="size-4" />
            </Button>
          )}
        </div>
        <Button
          disabled={disabled}
          onClick={onSubmit}
          variant="default"
          size="icon"
          className="rounded-full"
        >
          <ArrowUpIcon className="size-5" />
        </Button>
      </div>
    </div>
  );
}
