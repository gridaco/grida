"use client";

import { cn } from "@app/ui/lib/utils";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@app/ui/components/command";
import { FileIcon, FolderIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useEffect, useRef } from "react";
import {
  useComposerInternals,
  useComposer,
  type ComposerAttachment,
  type ComposerCommand,
  type ComposerMention,
} from "./composer-react";

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
  const mimeSubtype = attachment.mime?.split("/")[1]?.split("+")[0];
  const extension = attachment.name.includes(".")
    ? attachment.name.split(".").pop()
    : undefined;
  return (mimeSubtype || extension || "file").toUpperCase();
}

export function ComposerTriggerMenu({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) {
  const composer = useComposer();
  const { triggerMenuId } = useComposerInternals();
  const resolvedId = id ?? triggerMenuId;
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
      id={resolvedId}
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
                  key={itemValues[index]}
                  ref={(node) => {
                    if (node) {
                      node.id = `${resolvedId}-${trigger.kind}-${item.id}`;
                    }
                    if (index === composer.triggerIndex) {
                      selectedRef.current = node;
                    }
                  }}
                  value={itemValues[index]}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onMouseMove={() => composer.setTriggerIndex(index)}
                  onSelect={() => {
                    composer.selectTriggerItem(index);
                  }}
                >
                  {/* Title takes priority. `shrink-0` keeps it at full width
                      so the description — the only flexible sibling (`flex-1`)
                      — is what yields and truncates when the row is tight.
                      `max-w-full truncate` on the title only kicks in when the
                      title alone is wider than the whole row. (A `shrink` ratio
                      doesn't work here: flexbox distributes shrink by
                      `shrink × content-width`, so a long description still
                      forces the title to give up space.) */}
                  <span className="flex w-full min-w-0 items-baseline gap-2">
                    <span className="shrink-0 font-mono text-muted-foreground">
                      {trigger.kind === "command" ? "/" : "@"}
                    </span>
                    <span className="max-w-full shrink-0 truncate font-normal">
                      {trigger.kind === "command"
                        ? (item as ComposerCommand).title
                        : (item as ComposerMention).label}
                    </span>
                    {description && (
                      <span className="min-w-0 flex-1 truncate text-muted-foreground text-xs">
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

function ComposerAttachmentCard({
  attachment,
  onRemove,
}: {
  attachment: ComposerAttachment;
  onRemove: () => void;
}) {
  if (attachment.kind === "directory") {
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
    <div className="group/attachment flex h-11 w-48 max-w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-background px-1.5">
      <div className="relative size-8 shrink-0">
        <div
          className={cn(
            "absolute inset-0 flex items-center justify-center overflow-hidden rounded-md bg-muted transition-opacity group-hover/attachment:opacity-0 group-focus-within/attachment:opacity-0 [@media(hover:none)]:opacity-0",
            iconClassName
          )}
        >
          {icon}
        </div>
        <button
          aria-label={`Remove ${name}`}
          className="absolute inset-0 flex items-center justify-center rounded-md bg-muted text-muted-foreground opacity-0 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/attachment:opacity-100 group-focus-within/attachment:opacity-100 [@media(hover:none)]:opacity-100"
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

function getMentionDescription(mention: ComposerMention): string | undefined {
  if (mention.kind === "file" || mention.kind === "folder") return undefined;
  return mention.description;
}
