"use client";

import { cn } from "@app/ui/lib/utils";
import { FileIcon, FolderIcon, XIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { useComposer, type ComposerAttachment } from "./composer-react";

function isImageAttachment(
  attachment: ComposerAttachment
): attachment is Exclude<ComposerAttachment, { kind: "directory" }> & {
  url: string;
} {
  return (
    attachment.kind !== "directory" &&
    !!attachment.mime?.startsWith("image/") &&
    attachment.mime !== "image/svg+xml" &&
    !!attachment.url
  );
}

function getAttachmentTypeLabel(attachment: ComposerAttachment): string {
  if (attachment.kind === "directory") return "Folder · read only";
  if (attachment.mime === "inode/directory") return "Folder";
  const mimeSubtype = attachment.mime?.split("/")[1]?.split("+")[0];
  const extension = attachment.name.includes(".")
    ? attachment.name.split(".").pop()
    : undefined;
  // A video's subtype names its container ("quicktime"); its extension reads better.
  const type = (
    (attachment.mime?.startsWith("video/") && extension) ||
    mimeSubtype ||
    extension ||
    "file"
  ).toUpperCase();
  return attachment.caption ? `${type} · ${attachment.caption}` : type;
}

export { ComposerTriggerMenu } from "./composer-menu";

export function ComposerAttachmentCards({
  className,
  onRemoveAttachment,
  renderAttachment,
}: {
  className?: string;
  onRemoveAttachment?: (attachment: ComposerAttachment) => void;
  renderAttachment?: (
    attachment: ComposerAttachment,
    controls: { remove: () => void }
  ) => ReactNode;
}) {
  const { snapshot, removeAttachment } = useComposer();

  if (!snapshot.attachments.length) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {snapshot.attachments.map((attachment) => {
        const controls = {
          remove() {
            onRemoveAttachment?.(attachment);
            removeAttachment(attachment.id);
          },
        };
        return (
          <div
            className="min-w-0 max-w-full"
            data-composer-attachment={attachment.id}
            key={attachment.id}
          >
            {renderAttachment ? (
              renderAttachment(attachment, controls)
            ) : (
              <ComposerAttachmentCard
                attachment={attachment}
                onRemove={controls.remove}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One attachment card: a thumbnail or icon, the name and type, and remove. */
export function ComposerAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  if (
    attachment.kind === "directory" ||
    attachment.mime === "inode/directory"
  ) {
    return (
      <AttachmentCardShell
        icon={<FolderIcon className="size-3.5" />}
        iconClassName="text-sky-500"
        label={getAttachmentTypeLabel(attachment)}
        name={attachment.name}
        onRemove={onRemove}
      />
    );
  }

  if (isImageAttachment(attachment)) {
    return (
      <AttachmentCardShell
        icon={
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="32px"
            src={attachment.url}
            unoptimized
          />
        }
        label={getAttachmentTypeLabel(attachment)}
        name={attachment.name}
        onRemove={onRemove}
      />
    );
  }

  if (attachment.poster) {
    return (
      <AttachmentCardShell
        icon={
          <Image
            alt=""
            className="object-cover"
            fill
            sizes="32px"
            src={attachment.poster}
            unoptimized
          />
        }
        label={getAttachmentTypeLabel(attachment)}
        name={attachment.name}
        onRemove={onRemove}
      />
    );
  }

  return (
    <AttachmentCardShell
      icon={<FileIcon className="size-3.5" />}
      iconClassName="text-muted-foreground"
      label={getAttachmentTypeLabel(attachment)}
      name={attachment.name}
      onRemove={onRemove}
    />
  );
}

function AttachmentCardShell({
  icon,
  iconClassName,
  label,
  name,
  onRemove,
}: {
  icon: ReactNode;
  iconClassName?: string;
  label: string;
  name: string;
  onRemove: () => void;
}) {
  return (
    <div className="group/attachment flex h-11 w-48 max-w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-1.5">
      <div className="relative size-8 shrink-0">
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl bg-muted transition-opacity group-hover/attachment:opacity-0 group-focus-within/attachment:opacity-0 [@media(hover:none)]:opacity-0",
            iconClassName
          )}
        >
          {icon}
        </div>
        <button
          aria-label={`Remove ${name}`}
          className="absolute inset-0 flex items-center justify-center rounded-xl bg-muted text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 [@media(hover:none)]:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      </div>
      <span className="min-w-0 flex-1" title={name}>
        <span className="block truncate font-medium text-xs leading-4">
          {name}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground leading-3">
          {label}
        </span>
      </span>
    </div>
  );
}
