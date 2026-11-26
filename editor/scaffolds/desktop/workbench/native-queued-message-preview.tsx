"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type {
  NativeChatDisplayPart,
  NativeChatMessageAttachment,
} from "@grida/desktop-bridge";
import { MessageContextParts } from "@/kits/agent-chat/message-context-parts";
import { UserMessageText } from "@/kits/agent-chat/message";
import { projectUserMessageSkills } from "@/kits/agent-chat/user-message-markdown";
import { SkillMentions } from "@/lib/agent-chat/skill-mentions";
import { WorkspaceMention } from "@/kits/composer/workspace-mention";
import { ListEndIcon } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@app/ui/components/hover-card";
import { image_attachment_preview } from "@/lib/agent-chat/image-attachment-preview";
import { video_attachment } from "@/lib/agent-chat/video-attachment";

/** The same queued-message summary and hover detail used by Desktop and its UI lab. */
export function NativeQueuedMessagePreview({
  inputId,
  preview,
  label = preview ?? "Message with other content",
  attachments = [],
  displayParts,
  snapshotPreview,
  readText,
  readImage,
}: NativeQueuedMessagePreview.Props) {
  const readers = useRef({ readText, readImage });
  readers.current = { readText, readImage };
  const attachment = attachments.find(
    (entry) => entry.preview?.poster || entry.mimeType?.startsWith("image/")
  );
  const imageName = attachment?.name;
  const mimeType = attachment?.mimeType;
  const previewId = attachment?.previewId;
  const poster = attachment?.preview?.poster;
  const hasTextReader = !!readText;
  const hasImageReader = !!readImage;
  const controller = useMemo(
    () =>
      new NativeQueuedMessagePreview.Controller({
        preview,
        ...(hasTextReader && { readText: () => readers.current.readText!() }),
        ...(hasImageReader && {
          readImage: (id) => readers.current.readImage!(id),
        }),
        ...(imageName && {
          image: { name: imageName, mimeType, previewId, poster },
        }),
      }),
    [
      inputId,
      preview,
      hasTextReader,
      hasImageReader,
      imageName,
      mimeType,
      previewId,
      poster,
    ]
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.read,
    controller.read
  );
  useEffect(() => controller.connect(), [controller]);
  const authored = projectUserMessageSkills(state.text ?? "", displayParts);
  // The host retains a 2 KiB snapshot prefix, clipped at a UTF-8 boundary.
  // A complete inspector reply or optimistic message keeps its literal text.
  const clipped =
    snapshotPreview &&
    preview?.endsWith("…") &&
    new TextEncoder().encode(preview).byteLength >= 2045;
  const showingClipped = clipped && !state.textLoaded;
  const labelText = SkillMentions.previewText(label, displayParts);
  return (
    <HoverCard
      open={state.open}
      onOpenChange={controller.setOpen}
      openDelay={200}
      closeDelay={100}
    >
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-testid="native-queued-message-preview"
          aria-label="Preview queued message"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => controller.setOpen(!state.open)}
        >
          <ListEndIcon className="size-4 shrink-0 text-muted-foreground" />
          {state.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={state.image}
              alt={imageName ?? "Queued image"}
              onError={controller.imageFailed}
              className="size-7 shrink-0 rounded-md object-cover"
            />
          )}
          <span className="min-w-0 flex-1 truncate">
            {clipped
              ? WorkspaceMention.previewText(labelText)
              : WorkspaceMention.plainText(labelText)}
          </span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-96 max-w-[calc(100vw-2rem)] rounded-xl p-3"
      >
        {authored.context.length > 0 && (
          <MessageContextParts parts={authored.context} className="mb-2" />
        )}
        <NativeQueuedMessagePreview.Content
          text={
            state.text === null
              ? null
              : (showingClipped
                  ? WorkspaceMention.previewText
                  : WorkspaceMention.plainText)(
                  SkillMentions.previewText(state.text, displayParts)
                )
          }
          formattedText={
            !showingClipped &&
            (authored.links.size > 0 || authored.hasWorkspaceMentions) && (
              <UserMessageText
                text={authored.text}
                skillLinks={authored.links}
              />
            )
          }
          loading={state.loading}
          unavailable={state.unavailable}
          attachments={attachments}
          image={state.image}
          onImageError={controller.imageFailed}
        />
      </HoverCardContent>
    </HoverCard>
  );
}

export namespace NativeQueuedMessagePreview {
  export type Props = Readonly<{
    inputId: string;
    preview: string | null;
    label?: string;
    attachments?: readonly NativeChatMessageAttachment[];
    displayParts?: readonly NativeChatDisplayPart[];
    snapshotPreview?: boolean;
    /** Observer-only read; opening the preview never edits the queued input. */
    readText?: () => Promise<string>;
    /** An attachment capability from this queued message, never a path or URL. */
    readImage?: (previewId: string) => Promise<Blob>;
  }>;
  type Image = Readonly<{
    name: string;
    mimeType?: string;
    previewId?: string;
    poster?: string;
  }>;
  type Options = Pick<Props, "preview" | "readText" | "readImage"> & {
    image?: Image;
  };
  type State = Readonly<{
    open: boolean;
    text: string | null;
    textLoaded: boolean;
    loading: boolean;
    unavailable: boolean;
    image: string | null;
  }>;

  /** Coalesces hover reads and discards any result after the row is replaced. */
  export class Controller {
    private state: State;
    private readonly listeners = new Set<() => void>();
    private connection?: object;
    private textRead?: Promise<void>;
    constructor(
      private readonly options: Options,
      private readonly renderImage: (
        image: Blob,
        name: string
      ) => Promise<string | undefined> = async (image, name) =>
        (
          await image_attachment_preview.probe(
            new File([image], name, { type: image.type })
          )
        )?.poster
    ) {
      this.state = {
        open: false,
        text: options.preview,
        textLoaded: false,
        loading: false,
        unavailable: false,
        image: validPoster(options.image?.poster),
      };
    }
    readonly read = (): State => this.state;
    readonly subscribe = (listener: () => void): (() => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    connect(): () => void {
      const connection = {};
      this.connection = connection;
      if (
        !this.state.image &&
        this.options.image?.previewId &&
        this.options.readImage
      )
        void this.loadImage(connection);
      if (this.state.open) void this.loadText();
      return () => {
        if (this.connection === connection) this.connection = undefined;
      };
    }
    readonly setOpen = (open: boolean): void => {
      this.publish({ open });
      if (open) void this.loadText();
    };
    readonly imageFailed = (): void => {
      this.publish({ image: null });
    };
    private loadText(): Promise<void> {
      const connection = this.connection;
      if (!connection || !this.options.readText || this.state.textLoaded)
        return Promise.resolve();
      if (this.textRead) return this.textRead;
      this.publish({ loading: true, unavailable: false });
      const pending = Promise.resolve()
        .then(() => {
          if (this.connection !== connection)
            throw new Error("queued_preview_unavailable");
          return this.options.readText!();
        })
        .then((text) => {
          if (this.connection !== connection) return;
          this.publish({ text, textLoaded: true, loading: false });
        })
        .catch(() => {
          if (this.connection === connection)
            this.publish({ loading: false, unavailable: true });
        })
        .finally(() => {
          if (this.textRead === pending) this.textRead = undefined;
        });
      this.textRead = pending;
      return pending;
    }
    private async loadImage(connection: object): Promise<void> {
      const image = this.options.image!;
      if (!image.mimeType?.startsWith("image/")) return;
      try {
        await Promise.resolve();
        if (this.connection !== connection) return;
        const blob = await this.options.readImage!(image.previewId!);
        if (
          this.connection !== connection ||
          blob.size > image_attachment_preview.MAX_SOURCE_BYTES
        )
          return;
        const source = validPoster(await this.renderImage(blob, image.name));
        if (this.connection === connection && source)
          this.publish({ image: source });
      } catch {
        // Preview failure does not affect the queued message or its attachment.
      }
    }
    private publish(patch: Partial<State>): void {
      this.state = { ...this.state, ...patch };
      for (const listener of this.listeners) listener();
    }
  }

  export function Content({
    text,
    formattedText,
    loading = false,
    unavailable = false,
    attachments = [],
    image = null,
    onImageError,
  }: {
    text: string | null;
    formattedText?: React.ReactNode;
    loading?: boolean;
    unavailable?: boolean;
    attachments?: readonly NativeChatMessageAttachment[];
    image?: string | null;
    onImageError?: () => void;
  }) {
    return (
      <div
        className="flex max-h-80 flex-col gap-2 overflow-y-auto"
        aria-label="Queued message preview"
      >
        {image && (
          // Display-only bounded data URLs never use the Next image proxy.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={imageName(attachments)}
            onError={onImageError}
            className="max-h-40 max-w-full self-start rounded-lg object-contain"
          />
        )}
        {attachments.length > 0 && (
          <p className="break-words text-xs text-muted-foreground">
            {attachments.map((entry) => entry.name).join(", ")}
          </p>
        )}
        {formattedText ? (
          <div className="text-sm">{formattedText}</div>
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">
            {text ?? "Message with other content"}
          </p>
        )}
        {loading && (
          <p role="status" className="text-xs text-muted-foreground">
            Loading full message…
          </p>
        )}
        {unavailable && (
          <p role="status" className="text-xs text-muted-foreground">
            Full message unavailable. Showing the saved preview.
          </p>
        )}
      </div>
    );
  }
  function validPoster(source?: string): string | null {
    return source &&
      source.length <= video_attachment.MAX_POSTER_BYTES &&
      /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(source)
      ? source
      : null;
  }
}

function imageName(
  attachments: readonly NativeChatMessageAttachment[]
): string {
  return (
    attachments.find(
      (entry) => entry.preview?.poster || entry.mimeType?.startsWith("image/")
    )?.name ?? "Queued image"
  );
}
