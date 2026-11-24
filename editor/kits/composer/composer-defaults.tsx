"use client";

import { cn } from "@app/ui/lib/utils";
import { FileIcon, FolderIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useState, type ReactNode } from "react";
import type { ComposerFileAttachment } from "./composer-core";
import { useComposer, type ComposerAttachment } from "./composer-react";

export { ComposerTriggerMenu } from "./composer-menu";

/** A single row with room for the floating removal buttons. */
export function ComposerAttachmentStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex max-w-full items-end gap-2.5 overflow-x-auto overscroll-x-contain px-3 pt-2.5 pb-0.5 [scrollbar-width:none] empty:hidden [&>*]:shrink-0",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ComposerAttachmentCards({
  className,
  onRemoveAttachment,
}: {
  className?: string;
  onRemoveAttachment?: (attachment: ComposerAttachment) => void;
}) {
  const { snapshot, removeAttachment } = useComposer();
  if (!snapshot.attachments.length) return null;
  return (
    <ComposerAttachmentStrip className={className}>
      {snapshot.attachments.map((attachment) => (
        <ComposerAttachmentCard
          key={attachment.id}
          attachment={attachment}
          onRemove={() => {
            onRemoveAttachment?.(attachment);
            removeAttachment(attachment.id);
          }}
        />
      ))}
    </ComposerAttachmentStrip>
  );
}

/** Displays an attachment using its supplied image or poster when available. */
export function ComposerAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove?: () => void;
}) {
  const { name } = attachment;
  const readOnlyFolder = attachment.kind === "directory";
  return (
    <div
      className="group/attachment relative min-w-0 max-w-full"
      data-composer-attachment={attachment.id}
      title={name}
    >
      {readOnlyFolder || attachment.mime === "inode/directory" ? (
        <div className="flex h-11 w-48 max-w-full items-center gap-2 rounded-xl border bg-background px-1.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-muted text-sky-500">
            <FolderIcon aria-hidden="true" className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-xs leading-4 font-medium">{name}</div>
            <div className="truncate text-[10px] leading-3 text-muted-foreground">
              {readOnlyFolder ? "Folder · read only" : "Folder"}
            </div>
          </div>
        </div>
      ) : (
        <FileCard attachment={attachment} />
      )}
      {onRemove && (
        <button
          aria-label={`Remove ${name}`}
          className="group/remove absolute -top-2.5 -right-2.5 z-10 grid size-7 cursor-pointer place-items-center rounded-full opacity-0 focus-visible:outline-none motion-safe:transition-opacity group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 pointer-coarse:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <span className="grid size-3.5 place-items-center rounded-full bg-foreground text-background shadow-xs ring-1 ring-background group-hover/remove:bg-foreground/85 group-focus-visible/remove:outline-2 group-focus-visible/remove:outline-offset-2 group-focus-visible/remove:outline-ring">
            <XIcon aria-hidden="true" className="size-2" />
          </span>
        </button>
      )}
    </div>
  );
}

function FileCard({ attachment }: { attachment: ComposerFileAttachment }) {
  const [failedSource, setFailedSource] = useState<string>();
  const { name, mime, url, poster, caption } = attachment;
  const isImage = mime?.startsWith("image/") && mime !== "image/svg+xml";
  const source = (isImage && url) || poster;
  const preview = source && source !== failedSource && (
    <Image
      alt={isImage ? name : ""}
      className="object-cover"
      fill
      sizes="96px"
      src={source}
      unoptimized
      onError={() => setFailedSource(source)}
    />
  );
  const extension = name.includes(".") ? name.split(".").pop() : undefined;

  return (
    <div className="relative flex size-24 flex-col overflow-hidden rounded-xl border bg-muted">
      {isImage && preview ? (
        preview
      ) : (
        <>
          <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden">
            {preview || (
              <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
                <FileIcon aria-hidden="true" className="size-6 stroke-[1.5]" />
                <span className="max-w-16 truncate text-[9px] font-medium uppercase">
                  {extension || "File"}
                </span>
              </div>
            )}
          </div>
          <div className="min-w-0 border-t bg-background px-2 py-1.5">
            <span className="block truncate text-xs font-medium">{name}</span>
            {caption && (
              <span
                className="block truncate text-[10px] leading-3 text-muted-foreground"
                title={caption}
              >
                {caption}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
