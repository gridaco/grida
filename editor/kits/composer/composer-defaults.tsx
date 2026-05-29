"use client";

import { cn } from "@/components/lib/utils/index";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ImageIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useEffect, useRef } from "react";
import {
  useComposer,
  type ComposerAttachment,
  type ComposerCommand,
  type ComposerMention,
} from "./composer-react";

function isImageAttachment(
  attachment: ComposerAttachment
): attachment is ComposerAttachment & { url: string } {
  return (
    !!attachment.mime?.startsWith("image/") &&
    attachment.mime !== "image/svg+xml" &&
    !!attachment.url
  );
}

function getAttachmentTypeLabel(attachment: ComposerAttachment): string {
  const mimeSubtype = attachment.mime?.split("/")[1]?.split("+")[0];
  const extension = attachment.name.includes(".")
    ? attachment.name.split(".").pop()
    : undefined;
  return (mimeSubtype || extension || "file").toUpperCase();
}

export function ComposerTriggerMenu({
  className,
  id = "composer-trigger-menu",
}: {
  className?: string;
  id?: string;
}) {
  const composer = useComposer();
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const trigger = composer.trigger;

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      block: "nearest",
    });
  }, [composer.triggerIndex, trigger?.kind, trigger?.query]);

  if (!trigger || trigger.items.length === 0) return null;

  const itemValues = trigger.items.map((item) => `${trigger.kind}:${item.id}`);
  const selectedValue =
    itemValues[composer.triggerIndex] ?? itemValues[0] ?? "";

  return (
    <div
      className={cn(
        "absolute right-0 bottom-full left-0 z-20 mb-2 overflow-hidden rounded-md border border-border bg-background shadow-lg",
        className
      )}
      data-composer-trigger-menu
    >
      <Command
        className="bg-transparent"
        shouldFilter={false}
        value={selectedValue}
        onValueChange={(value) => {
          const index = itemValues.indexOf(value);
          if (index >= 0) composer.setTriggerIndex(index);
        }}
      >
        <CommandList
          aria-label={trigger.kind === "command" ? "Commands" : "Mentions"}
          className="max-h-64 scroll-py-1 p-1"
          id={id}
        >
          <CommandGroup className="p-0">
            {trigger.items.map((item, index) => {
              const description =
                trigger.kind === "command"
                  ? (item as ComposerCommand).description
                  : getMentionDescription(item as ComposerMention);
              return (
                <CommandItem
                  className="scroll-my-1 items-center py-1"
                  id={`${id}-${trigger.kind}-${item.id}`}
                  key={itemValues[index]}
                  ref={index === composer.triggerIndex ? selectedRef : null}
                  value={itemValues[index]}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onMouseMove={() => composer.setTriggerIndex(index)}
                  onSelect={() => {
                    composer.selectTriggerItem(index);
                  }}
                >
                  <span className="min-w-0 flex items-baseline gap-2">
                    <span className="font-mono text-muted-foreground">
                      {trigger.kind === "command" ? "/" : "@"}
                    </span>
                    <span className="truncate font-normal">
                      {trigger.kind === "command"
                        ? (item as ComposerCommand).title
                        : (item as ComposerMention).label}
                    </span>
                    {description && (
                      <span className="truncate text-muted-foreground text-xs">
                        {description}
                      </span>
                    )}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  );
}

export function ComposerAttachmentCards({
  className,
  renderAttachment,
}: {
  className?: string;
  renderAttachment?: (
    attachment: ComposerAttachment,
    controls: { remove: () => void }
  ) => ReactNode;
}) {
  const { snapshot, removeAttachment } = useComposer();

  if (!snapshot.attachments.length) return null;

  return (
    <div className={cn("flex flex-wrap items-end gap-2", className)}>
      {snapshot.attachments.map((attachment) => {
        const controls = { remove: () => removeAttachment(attachment.id) };
        return (
          <div data-composer-attachment={attachment.id} key={attachment.id}>
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

function ComposerAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  if (isImageAttachment(attachment)) {
    return (
      <div className="group relative size-20 overflow-hidden rounded-md border border-border bg-muted">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="80px"
          src={attachment.url}
          unoptimized
        />
        <button
          aria-label={`Remove ${attachment.name}`}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground group-hover:opacity-100"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-12 max-w-52 min-w-40 items-center gap-2 rounded-md border border-border bg-background px-2 py-1 shadow-xs">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-orange-600">
        <ImageIcon className="size-4" />
      </div>
      <span className="min-w-0 flex-1">
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-sm leading-tight">
          {attachment.name}
        </span>
        <span className="mt-0.5 block text-muted-foreground text-xs leading-tight">
          {getAttachmentTypeLabel(attachment)}
        </span>
      </span>
      <button
        aria-label={`Remove ${attachment.name}`}
        className="self-start -mt-0.5 -mr-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-foreground text-background hover:opacity-80"
        onClick={onRemove}
        type="button"
      >
        <XIcon className="size-2.5" />
      </button>
    </div>
  );
}

function getMentionDescription(mention: ComposerMention): string | undefined {
  if (mention.kind === "file" || mention.kind === "folder") return undefined;
  return mention.description;
}
