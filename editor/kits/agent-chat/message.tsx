/**
 * `@/kits/agent-chat` renderer — one chat turn (user or assistant),
 * render-only and props-driven. Built on the repo's
 * `@app/ui/ai-elements/*` primitives so every agent chat surface
 * (desktop sidebar, workspace pane, demo) shares one look:
 *
 *   - `Message` / `MessageContent` / `MessageResponse` — role-aware
 *     bubble framing with Streamdown-backed Markdown rendering.
 *   - `Task` — stock ai-elements collapsible. Every tool call renders as
 *     a compact `Task` row; a run of consecutive calls nests those rows
 *     inside one summary `Task` (title from `toolDisplay.summarize`).
 *   - `Shimmer` — running tool labels and the pending-turn "Thinking" indicator.
 *
 * Owns no state beyond the stock collapsibles; the caller passes a
 * settled-or-streaming `UIMessage` plus `isStreaming` for the live turn.
 */

"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type Ref,
} from "react";
import { getToolName, isFileUIPart, isTextUIPart, type FileUIPart } from "ai";
import type { NativeChatQuestionReply } from "@grida/desktop-bridge";
import { chat_vocabulary } from "@/lib/agent-chat/chat-vocabulary";
import { cn } from "@app/ui/lib/utils";
import markdownStyles from "@/components/chat-markdown.module.css";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  FileIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  FolderTreeIcon,
  FolderIcon,
  ImageIcon,
  ImagesIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  MonitorIcon,
  PaperclipIcon,
  PanelsTopLeftIcon,
  PencilIcon,
  ScrollTextIcon,
  SearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
  AppWindowIcon,
  WrenchIcon,
  type LucideIcon,
} from "lucide-react";
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "@app/ui/ai-elements/message";
import { Shimmer } from "@app/ui/ai-elements/shimmer";
import { Source } from "@app/ui/ai-elements/sources";
import { ToolOutput } from "@app/ui/ai-elements/tool";
import { Task, TaskContent, TaskTrigger } from "@app/ui/ai-elements/task";
// Message/tool types stay in the shared `@/lib/agent-chat` seam (the
// bridge transport + session helpers use them too); `toolDisplay` is
// this renderer's own label/summary formatting, colocated in the kit.
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat/types";
import { toolDisplay, type ToolDisplayDescription } from "./tool-display";
import {
  formatElapsed,
  isGenerateImageEntry,
  isMediaPending,
  isMediaToolEntry,
  MediaToolContent,
  useElapsedSeconds,
} from "./tool-media";
import { ToolCardContent, isHumanReadableToolCardEntry } from "./tool-card";
import {
  isDesignSearchEntry,
  DesignSearchContent,
} from "./design-search-widget";
import { groupMessageParts } from "./group-parts";
import { AnsweredQuestionSummary, isQuestionEntry } from "./question-card";
import { workspace_links } from "./workspace-links";
import { FullscreenImagePreview } from "@/kits/image-preview";
import { AttachmentImagePreview } from "./attachment-image-preview";
import { EditorSelectionIndicator } from "./editor-selection-indicator";
import { MessageContextParts } from "./message-context-parts";
import { ChatMessageEditor, type ChatMessageEdit } from "./message-editor";
import { WorkingIndicator } from "./working-indicator";
import { userMessageRemarkPlugins } from "./user-message-markdown";
import {
  hasOpenTabsResult,
  isSurfaceToolEntry,
  SurfaceToolContent,
} from "./surface-tool-card";

export type { ChatMessage, ToolCallEntry };

/** Shared transcript typography, user and agent alike. */
const CHAT_TEXT = "text-[14px] leading-[23px]";

const markdown = {
  // Markdown uses the shared chat reading size; see CHAT_TEXT.
  className: cn(markdownStyles.markdown, markdownStyles.agent, CHAT_TEXT),
  controls: {
    code: { copy: true, download: false },
    table: { copy: true, download: false, fullscreen: false },
  },
  plugins: { cjk, code, math, mermaid },
  rehypePlugins: workspace_links.rehypePlugins,
  components: workspace_links.components,
} as const;

function UserMessageText({ text }: { text: string }) {
  return (
    <MessageResponse
      className={cn(
        markdownStyles.user,
        "wrap-anywhere [&_p]:whitespace-pre-wrap"
      )}
      mode="static"
      controls={false}
      lineNumbers={false}
      plugins={markdown.plugins}
      remarkPlugins={userMessageRemarkPlugins}
      rehypePlugins={markdown.rehypePlugins}
      components={markdown.components}
    >
      {text}
    </MessageResponse>
  );
}

/**
 * Shared class string for the hover/focus-revealed action rows. The
 * `pointer-events-none` while hidden is the important
 * part: an `opacity-0` button is still hit-testable, so without it a tooltip
 * could open over actions the user can't even see. Gating pointer-events on
 * the same `group-hover` / `focus-within` states as opacity keeps
 * "visible ⟺ interactive" — a tooltip can only appear once the row has
 * actually faded in. Both rows share this so they can't drift apart.
 */
const revealOnHoverActions =
  "opacity-0 pointer-events-none transition-opacity " +
  "group-hover:opacity-100 group-hover:pointer-events-auto " +
  "focus-within:opacity-100 focus-within:pointer-events-auto";

export type ChatMessageActions = {
  /** Open an editor for this user message. */
  onEdit?: (messageId: string) => void;
  /** Disable the actions (e.g. while a run is in flight). */
  disabled?: boolean;
  /** When the message was sent, in UTC milliseconds. Shown with the actions. */
  sentAtMs?: number;
  /** A short, always-visible label after the actions, e.g. how it was sent. */
  note?: ReactNode;
  /**
   * Show no actions under an assistant message, e.g. commentary inside a turn
   * whose final answer carries them.
   */
  hidden?: boolean;
};

function isQuestionBatchReply(
  value: unknown
): value is NativeChatQuestionReply {
  return (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string" &&
    "waitId" in value &&
    typeof value.waitId === "string" &&
    "question" in value &&
    typeof value.question === "string" &&
    "answer" in value &&
    typeof value.answer === "string" &&
    (!("skipped" in value) || value.skipped === true)
  );
}

export function ChatMessageView({
  ref,
  message,
  isStreaming,
  actions,
  edit,
  loadAttachmentPreview,
  loadToolImage,
  responseFooter,
}: {
  ref?: Ref<HTMLDivElement>;
  message: ChatMessage;
  isStreaming?: boolean;
  /** Per-turn affordances under a message. User bubbles show copy without them. */
  actions?: ChatMessageActions;
  /** Replaces the user bubble in place without borrowing the composer draft. */
  edit?: ChatMessageEdit;
  /** Read-only retained PNG display, supplied by the owning host. */
  loadAttachmentPreview?: AttachmentImagePreview.Loader;
  /** Captured tool-result images, with authority kept separate from user attachments. */
  loadToolImage?: AttachmentImagePreview.Loader;
  /** Client-supplied display after a final assistant response. */
  responseFooter?: ReactNode;
}) {
  // A compaction summary (synthetic assistant turn carrying a
  // `data-compaction` part) renders as a divider with an expandable
  // summary rather than an empty assistant bubble.
  const compaction = findCompactionSummary(message);
  if (compaction) {
    return (
      <CompactionNotice summary={compaction.summary} auto={compaction.auto} />
    );
  }

  if (message.role === "user") {
    const text = message.parts
      .filter(isTextUIPart)
      .map((part) => part.text)
      .join("");
    const hasText = text.trim().length > 0;
    const questionReply = message.parts.find(
      (part) => part.type === chat_vocabulary.CONTEXT_PARTS.questionReply
    );
    const questionReplyData =
      questionReply && "data" in questionReply ? questionReply.data : undefined;
    const questionReplies =
      Array.isArray(questionReplyData) &&
      questionReplyData.every(isQuestionBatchReply)
        ? questionReplyData
        : undefined;
    const svgTextSelection = message.parts.some(
      (part) =>
        part.type === chat_vocabulary.CONTEXT_PARTS.svgTextSelection &&
        part.data === true
    );
    const svgSelection = message.parts.some(
      (part) =>
        part.type === chat_vocabulary.CONTEXT_PARTS.svgSelection &&
        part.data === true
    );
    const messageContext = message.parts.find(
      (part) => part.type === chat_vocabulary.CONTEXT_PARTS.messageContext
    );
    // Perceived images and host-supplied resources stay outside the prose
    // bubble. Neither their labels nor their previews become copyable text.
    const images = message.parts.filter(
      (part): part is FileUIPart =>
        isFileUIPart(part) && part.mediaType.startsWith("image/")
    );
    const contexts = message.parts.filter(
      (part) =>
        typeof (part as { type?: unknown }).type === "string" &&
        (part as { type: string }).type in chat_vocabulary.CONTEXT_MARKERS
    );
    return (
      <Message from="user" ref={ref}>
        {(svgSelection || svgTextSelection) && !edit && (
          <EditorSelectionIndicator
            label={svgSelection ? "Selection" : "Text selection"}
            className="self-end"
          />
        )}
        {messageContext &&
          "data" in messageContext &&
          Array.isArray(messageContext.data) && (
            <MessageContextParts
              parts={messageContext.data}
              className="justify-end"
            />
          )}
        <UserMessageAttachments
          contexts={contexts}
          images={images}
          loadAttachmentPreview={loadAttachmentPreview}
        />
        {edit ? (
          <ChatMessageEditor edit={edit} />
        ) : (
          hasText && (
            <MessageContent
              className={CHAT_TEXT}
              role="group"
              aria-label="Message text"
            >
              <CollapsibleBubbleBody>
                {questionReplies ? (
                  <div className="space-y-3">
                    {questionReplies.map((reply) => (
                      <div key={reply.id}>
                        <blockquote className="mb-1 border-s-2 border-muted-foreground/40 ps-2 text-xs whitespace-pre-wrap text-muted-foreground">
                          {reply.question}
                        </blockquote>
                        {reply.skipped ? (
                          <span className="text-muted-foreground">Skipped</span>
                        ) : (
                          <UserMessageText text={reply.answer} />
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    {typeof questionReplyData === "string" && (
                      <blockquote className="mb-1 border-s-2 border-muted-foreground/40 ps-2 text-xs whitespace-pre-wrap text-muted-foreground">
                        {questionReplyData}
                      </blockquote>
                    )}
                    <UserMessageText text={text} />
                  </>
                )}
              </CollapsibleBubbleBody>
            </MessageContent>
          )
        )}
        {/* Subtle until hover so the transcript stays clean; right-aligned
            to sit under the user bubble. Copy is always available (a pure
            clipboard action, never disabled). History controls appear only
            when the host wires them. */}
        {!edit &&
          !actions?.hidden &&
          (hasText || actions?.sentAtMs !== undefined || actions?.note) && (
            <div className="ml-auto flex items-center gap-2">
              <MessageActions className={revealOnHoverActions}>
                {actions?.sentAtMs !== undefined && (
                  <MessageTime at={actions.sentAtMs} />
                )}
                {hasText && <CopyMessageAction text={text} />}
                {hasText && actions?.onEdit && (
                  <MessageAction
                    tooltip="Edit and resubmit"
                    disabled={actions.disabled}
                    onClick={() => actions.onEdit?.(message.id)}
                  >
                    <PencilIcon />
                  </MessageAction>
                )}
              </MessageActions>
              {actions?.note && (
                <span className="text-muted-foreground flex items-center gap-1 text-xs [&_svg]:size-3.5">
                  {actions.note}
                </span>
              )}
            </div>
          )}
      </Message>
    );
  }

  // Assistant messages fill the available width — the bubble framing
  // is reserved for user messages, the assistant's response flows like
  // a document. Matches the web panel's `w-full max-w-none` on
  // `<Message from="assistant">`.
  const groups = groupMessageParts(message);
  const sources = message.parts
    .filter((part) => part.type === "source-url")
    .filter((source) => /^https?:\/\//i.test(source.url));
  const hasVisibleContent = groups.length > 0 || sources.length > 0;
  // Copyable response = the assistant's visible text only (non-text parts are
  // excluded). Multiple text parts can be split by tool
  // calls, so rejoin them with blank lines to preserve paragraph breaks.
  const responseText = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n");
  return (
    <Message from="assistant" ref={ref} className="w-full max-w-none">
      <MessageContent className={`w-full max-w-full ${CHAT_TEXT}`}>
        {groups.map((group) => {
          if (group.type === "text") {
            return (
              <MessageResponse
                key={group.key}
                className={markdown.className}
                controls={markdown.controls}
                lineNumbers={false}
                plugins={markdown.plugins}
                rehypePlugins={markdown.rehypePlugins}
                components={markdown.components}
              >
                {group.text}
              </MessageResponse>
            );
          }
          return (
            <ToolCallGroupView
              key={group.key}
              entries={group.entries}
              loadToolImage={loadToolImage}
            />
          );
        })}
        {sources.length > 0 && (
          <ul
            aria-label="Sources"
            className="flex flex-wrap gap-2 text-xs text-muted-foreground"
          >
            {sources.map((source) => (
              <li key={source.sourceId}>
                <Source
                  href={source.url}
                  className="underline underline-offset-2"
                >
                  {source.title || source.url}
                </Source>
              </li>
            ))}
          </ul>
        )}
        {isStreaming && !hasVisibleContent && (
          <Shimmer className="text-xs">Thinking</Shimmer>
        )}
      </MessageContent>
      {responseFooter}
      {/* Copy mirrors the user-bubble affordance but left-aligned under the
          assistant response. Shown only once the turn has settled with real
          text — never over a half-streamed or tool-only (text-less) turn. */}
      {!isStreaming && !actions?.hidden && responseText.trim().length > 0 && (
        <MessageActions className={revealOnHoverActions}>
          {actions?.sentAtMs !== undefined && (
            <MessageTime at={actions.sentAtMs} />
          )}
          <CopyMessageAction text={responseText} />
        </MessageActions>
      )}
    </Message>
  );
}

/** Display supplied previews or an exact host-minted read capability, never a path. */
function UserMessageAttachments({
  contexts,
  images,
  loadAttachmentPreview,
}: {
  contexts: ChatMessage["parts"];
  images: FileUIPart[];
  loadAttachmentPreview?: AttachmentImagePreview.Loader;
}) {
  const otherContexts = contexts.flatMap((part, contextIndex) => {
    const type = (part as { type: string }).type;
    const label = chat_vocabulary.CONTEXT_MARKERS[type];
    return type !== chat_vocabulary.CONTEXT_PARTS.files && label
      ? [{ label, contextIndex }]
      : [];
  });
  const files = contexts.flatMap((rawPart, contextIndex) => {
    const part = rawPart as { type: string; data?: { files?: unknown } };
    if (part.type !== chat_vocabulary.CONTEXT_PARTS.files) return [];
    return (Array.isArray(part.data?.files) ? part.data.files : []).flatMap(
      (file) => {
        if (!file || typeof file.name !== "string" || !file.name) return [];
        const directory = file.kind === "directory";
        const image =
          !directory &&
          ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
            file.mimeType
          );
        const previewId =
          !directory &&
          image &&
          typeof file.previewId === "string" &&
          file.previewId.length > 0 &&
          file.previewId.length <= 256
            ? file.previewId
            : undefined;
        const poster =
          !directory &&
          typeof file.poster === "string" &&
          file.poster.length <= 48 * 1024 &&
          /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(
            file.poster
          )
            ? file.poster
            : undefined;
        return [
          {
            name: file.name,
            contextIndex,
            directory,
            image,
            poster,
            previewId,
            caption: directory
              ? "Folder"
              : typeof file.caption === "string"
                ? file.caption
                : image
                  ? "Preview unavailable"
                  : "File",
          },
        ];
      }
    );
  });
  const items = [...files, ...otherContexts].sort(
    (first, second) => first.contextIndex - second.contextIndex
  );
  if (items.length === 0 && images.length === 0) return null;
  return (
    <ul
      aria-label="Message attachments"
      className="ml-auto flex max-w-full flex-wrap justify-end gap-2"
    >
      {items.map((item, index) => {
        if ("label" in item)
          return (
            <li key={`context-${index}`} className="max-w-full min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-sm">
                <PaperclipIcon className="size-3.5 text-muted-foreground" />
                {item.label}
              </span>
            </li>
          );
        const file = item;
        return (
          // Accepted message parts never reorder. Avoid keeping preview bytes in keys.
          <li key={`file-${index}`} className="max-w-full min-w-0">
            {file.previewId && loadAttachmentPreview ? (
              <AttachmentImagePreview.View
                previewId={file.previewId}
                loader={loadAttachmentPreview}
                name={file.name}
              />
            ) : file.image && file.poster ? (
              <AttachmentImagePreview.Image
                source={file.poster}
                name={file.name}
                downloadName={`${file.name}.preview.${file.poster.startsWith("data:image/png") ? "png" : "jpg"}`}
              />
            ) : (
              <figure className="m-0 w-52 max-w-full overflow-hidden rounded-lg border bg-background">
                {file.poster ? (
                  <FullscreenImagePreview
                    src={file.poster}
                    alt={file.name}
                    title={`Preview ${file.name}`}
                    downloadName={`${file.name}.preview.${file.poster.startsWith("data:image/png") ? "png" : "jpg"}`}
                    className="w-full"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={file.poster}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-36 w-full bg-muted/30 object-contain"
                    />
                  </FullscreenImagePreview>
                ) : null}
                <figcaption className="flex min-w-0 items-center gap-2 p-2 text-xs">
                  {!file.poster &&
                    (file.directory ? (
                      <FolderIcon className="size-5 shrink-0 text-muted-foreground" />
                    ) : file.image ? (
                      <ImageIcon className="size-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <PaperclipIcon className="size-5 shrink-0 text-muted-foreground" />
                    ))}
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium" title={file.name}>
                      {file.name}
                    </span>
                    {file.caption && (
                      <span className="truncate text-muted-foreground">
                        {file.caption}
                      </span>
                    )}
                  </span>
                </figcaption>
              </figure>
            )}
          </li>
        );
      })}
      {images.map((image, index) => {
        const source = attachmentImageSource(image.url);
        return (
          <li key={`image-${index}`} className="max-w-full min-w-0">
            <figure className="m-0 flex max-w-full flex-col gap-1">
              {source ? (
                <AttachmentImagePreview.Image
                  source={source}
                  name={image.filename ?? "Attached image"}
                  downloadName={image.filename}
                />
              ) : (
                <span className="flex h-36 w-52 max-w-full flex-col items-center justify-center gap-2 rounded-lg border bg-muted/30 text-xs text-muted-foreground">
                  <ImageIcon className="size-6" />
                  Preview unavailable
                </span>
              )}
              {!source && (
                <figcaption className="truncate text-xs text-muted-foreground">
                  {image.filename ?? "Attached image"}
                </figcaption>
              )}
            </figure>
          </li>
        );
      })}
    </ul>
  );
}

/** Only explicit image sources; file/custom schemes cannot become display grants. */
function attachmentImageSource(value: string): string | null {
  try {
    const source = new URL(value);
    if (source.protocol === "data:")
      return /^data:image\/(?:png|jpeg|webp|gif|avif|bmp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
        value
      )
        ? value
        : null;
    if (source.protocol === "blob:") return value;
    return (source.protocol === "https:" || source.protocol === "http:") &&
      !source.username &&
      !source.password
      ? value
      : null;
  } catch {
    return null;
  }
}

/** The local time a message was sent, shown with its hover actions. */
function MessageTime({ at }: { at: number }) {
  return (
    <time
      dateTime={new Date(at).toISOString()}
      className="text-muted-foreground px-1 text-xs tabular-nums"
    >
      {new Date(at).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}

/**
 * Height (px) a user bubble is clamped to before the "Show more" affordance
 * kicks in. Roughly ten lines of chat text — tall enough that
 * an ordinary message never collapses, short enough that a pasted wall of text
 * doesn't push the rest of the transcript off-screen.
 */
const BUBBLE_COLLAPSE_THRESHOLD_PX = 240;

// Layout-effect that degrades to a no-op on the server. The transcript is
// client-state-driven (messages arrive after mount), so this effectively only
// runs in the browser — but the demo seeds `initial_messages` through SSR, and
// a bare `useLayoutEffect` warns there. Measuring before paint (vs `useEffect`)
// avoids a flash where a long bubble renders full-height then snaps closed.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Wraps a user bubble's body and, when it exceeds
 * {@link BUBBLE_COLLAPSE_THRESHOLD_PX}, clamps it to that height behind a
 * fade-to-bubble gradient with a "Show more" / "Show less" toggle. The
 * affordance only appears when the content actually overflows — short messages
 * render untouched, with no measurement cost beyond a single observed element.
 *
 * The fade fills to `secondary` to match the bubble's own `bg-secondary`, so it
 * reads as the text dissolving into the bubble rather than a separate band. It
 * is `pointer-events-none` so text selection underneath still works.
 */
function CollapsibleBubbleBody({ children }: { children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useIsomorphicLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () =>
      setOverflowing(el.scrollHeight > BUBBLE_COLLAPSE_THRESHOLD_PX);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // Re-measure text wrapping after a resize or font change. Attachment
    // previews live outside the measured bubble.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const collapsed = overflowing && !expanded;

  return (
    <div className="flex flex-col gap-1">
      {/* Measured directly: `scrollHeight` reports the full content height
          even while the box is clamped, so the fade host and the measured
          element are one and the same — no separate inner wrapper needed. */}
      <div
        ref={contentRef}
        className={cn(
          "relative flex flex-col gap-2",
          collapsed && "overflow-hidden"
        )}
        style={
          collapsed ? { maxHeight: BUBBLE_COLLAPSE_THRESHOLD_PX } : undefined
        }
      >
        {children}
        {collapsed && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-secondary"
          />
        )}
      </div>
      {overflowing && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex w-fit items-center gap-1 text-xs font-medium text-foreground/60 transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
          <ChevronDownIcon
            className={cn(
              "size-3 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      )}
    </div>
  );
}

/**
 * Copy a message's text to the clipboard. Self-contained — copy is a
 * pure, always-safe action, so it owns its transient "copied" state here
 * and is never gated by `disabled`. Mirrors `CodeBlockCopyButton` in
 * `@app/ui/ai-elements/code-block`.
 */
function CopyMessageAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (typeof window === "undefined" || !navigator?.clipboard?.writeText) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked / unavailable — best-effort, nothing to surface
    }
  };
  return (
    <MessageAction tooltip={copied ? "Copied" : "Copy"} onClick={copy}>
      {copied ? <CheckIcon /> : <CopyIcon />}
    </MessageAction>
  );
}

function findCompactionSummary(
  message: ChatMessage
): { summary: string; auto: boolean } | null {
  for (const part of message.parts) {
    if ((part as { type?: string }).type !== "data-compaction") continue;
    const data = (part as { data?: { summary?: unknown; auto?: unknown } })
      .data;
    if (data && typeof data.summary === "string") {
      return { summary: data.summary, auto: Boolean(data.auto) };
    }
  }
  return null;
}

/**
 * How long an in-flight indicator runs bare before the elapsed-time counter
 * appears, in milliseconds. Below this only the shimmering label shows; at or
 * past it the "· {time}" counter is revealed.
 */
const ELAPSED_REVEAL_AFTER_MS = 10000;

/**
 * A shimmering label trailed by a live elapsed-time counter — the body of the
 * transcript's in-flight indicator ({@link PendingTurnIndicator}).
 *
 * The counter stays hidden for the first {@link ELAPSED_REVEAL_AFTER_MS}: a fast
 * operation settles before a timer grows, and only a wait long enough to feel
 * slow surfaces the elapsed time as reassurance.
 */
function ShimmerWithElapsed({ label }: { label: string }) {
  const elapsed = useElapsedSeconds();
  const text =
    elapsed * 1000 >= ELAPSED_REVEAL_AFTER_MS
      ? `${label} · ${formatElapsed(elapsed)}`
      : label;

  return (
    <Shimmer as="span" className="whitespace-nowrap text-xs tabular-nums">
      {text}
    </Shimmer>
  );
}

/**
 * Shows "Thinking" immediately before first output, then only after visible
 * progress goes quiet. Set `immediate` while the active turn has no output yet.
 * Change `progress` on actual streamed text or tool updates, not polling or
 * transcript replay. The surface owns paused, waiting and finished eligibility.
 * Key by turn identity to reset the quiet period for each new turn.
 */
export function PendingTurnIndicator({
  progress,
  immediate = false,
}: {
  progress: unknown;
  immediate?: boolean;
}) {
  const [indicator] = useState(() => new WorkingIndicator());
  const state = useSyncExternalStore(
    indicator.subscribe,
    indicator.read,
    indicator.read
  );
  useLayoutEffect(
    () => indicator.watch(progress, immediate),
    [indicator, progress, immediate]
  );
  // Hide in the same render as a new chunk, before the layout effect resets
  // the timer. A still-visible snapshot always belongs to its exact progress.
  if (!state.visible || !Object.is(state.progress, progress)) return null;
  return (
    <Message from="assistant" className="w-full max-w-none">
      <MessageContent className="w-full max-w-full">
        <ShimmerWithElapsed label="Thinking" />
      </MessageContent>
    </Message>
  );
}

const compactionRowClassName =
  "flex w-fit items-center gap-2 text-sm text-muted-foreground";

export function CompactionProgress() {
  return (
    <div role="status" className={cn(compactionRowClassName, "select-none")}>
      <ScrollTextIcon aria-hidden className="size-4 shrink-0" />
      <Shimmer as="span">Compacting context</Shimmer>
    </div>
  );
}

/** A transcript disclosure for the summary the model now reads. */
export function CompactionNotice({
  summary,
  auto,
}: {
  summary: string;
  auto: boolean;
}) {
  return (
    <details className="group/compaction w-full">
      <summary
        className={cn(
          compactionRowClassName,
          "cursor-pointer list-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden"
        )}
      >
        <ScrollTextIcon aria-hidden className="size-4 shrink-0" />
        {auto ? "Conversation auto-compacted" : "Conversation compacted"}
        <ChevronRightIcon
          aria-hidden
          className="size-3 shrink-0 opacity-0 transition-[opacity,rotate] group-open/compaction:rotate-90 group-open/compaction:opacity-100 group-hover/compaction:opacity-100 group-focus-within/compaction:opacity-100"
        />
      </summary>
      <div className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs leading-5 text-foreground/80">
        {summary}
      </div>
    </details>
  );
}

// A lone tool call renders as a single `Task` row; a run of consecutive
// calls nests those rows inside one summary `Task`.
/** Tool calls as cards; consecutive calls collapse into one summary row. */
export function ToolCallGroupView({
  entries,
  loadToolImage,
}: {
  entries: ToolCallEntry[];
  loadToolImage?: AttachmentImagePreview.Loader;
}) {
  if (entries.length === 1) {
    return <ToolCallView entry={entries[0]} loadToolImage={loadToolImage} />;
  }

  const { action, summary } = toolDisplay.group(entries);
  return (
    <Task defaultOpen={false} className="w-full">
      <TaskTrigger title={summary}>
        {triggerRow(iconForAction(action), summary, {
          shimmer: entries.some(isToolRunning),
        })}
      </TaskTrigger>
      <TaskContent>
        {entries.map((entry, index) => (
          // `toolCallId` is the natural identity, but it can be absent mid-stream
          // (a tool part before its id is assigned) — which made keys collide on
          // `undefined`. The index disambiguates; the group is append-only so it
          // stays stable for a given entry.
          <ToolCallView
            key={`${entry.toolCallId ?? "tool"}-${index}`}
            entry={entry}
            loadToolImage={loadToolImage}
          />
        ))}
      </TaskContent>
    </Task>
  );
}

/** The approval object present on a tool part once it's awaiting or carries an
 *  Allow/Deny answer. `undefined` for ordinary (non-supervised) tool calls.
 *  Return type is inferred so the discriminated `ToolUIPartApproval` union the
 *  `Confirmation` prop expects is preserved (a widened `approved?: boolean`
 *  annotation would break it). */
function approvalOf(entry: ToolCallEntry) {
  if (
    entry.state === "approval-requested" ||
    entry.state === "approval-responded" ||
    entry.state === "output-denied"
  ) {
    return entry.approval;
  }
  return undefined;
}

function isToolRunning(entry: ToolCallEntry): boolean {
  return entry.state === "input-streaming" || entry.state === "input-available";
}

function ToolCallView({
  entry,
  loadToolImage,
}: {
  entry: ToolCallEntry;
  loadToolImage?: AttachmentImagePreview.Loader;
}) {
  // A tool records what was asked. The owning chat presents the answer form.
  if (isQuestionEntry(entry)) {
    return <QuestionToolView entry={entry} />;
  }

  const description = toolDisplay.describe(entry);
  const title = description.detail
    ? `${description.title} · ${description.detail}`
    : description.title;
  // design_search renders its result as a thumbnail gallery (the gather step),
  // open by default — the point is to SEE the references, not unfold a JSON row.
  if (isDesignSearchEntry(entry)) {
    return (
      <Task defaultOpen className="w-full">
        <TaskTrigger title={title}>
          {triggerRow(iconForAction(description.action), title, {
            shimmer: isToolRunning(entry),
          })}
        </TaskTrigger>
        <TaskContent>
          <DesignSearchContent entry={entry} />
        </TaskContent>
      </Task>
    );
  }
  const mediaTool = isMediaToolEntry(entry);
  const surfaceTool = isSurfaceToolEntry(entry);
  const humanReadableTool = isHumanReadableToolCardEntry(entry);
  // The Allow/Deny ACTION lives in the session-global approval bar above the
  // composer (instantly visible). Here we only echo the status passively so the
  // transcript shows which call is awaiting / was approved / was denied.
  const approval = approvalOf(entry);
  const showTriggerSpinner =
    isGenerateImageEntry(entry) && isMediaPending(entry);

  return (
    <Task
      defaultOpen={mediaTool || humanReadableTool || hasOpenTabsResult(entry)}
      className="w-full"
    >
      <TaskTrigger title={title}>
        {triggerRow(iconForAction(description.action), title, {
          busy: showTriggerSpinner,
          shimmer: isToolRunning(entry),
        })}
      </TaskTrigger>
      {mediaTool ? (
        <TaskContent>
          <MediaToolContent entry={entry} loadToolImage={loadToolImage} />
        </TaskContent>
      ) : surfaceTool ? (
        <TaskContent>
          <SurfaceToolContent entry={entry} />
        </TaskContent>
      ) : (
        <TaskContent>
          <ToolCardContent entry={entry} approval={approval} />
        </TaskContent>
      )}
    </Task>
  );
}

function QuestionToolView({ entry }: { entry: ToolCallEntry }) {
  if (entry.state === "input-streaming") return null;
  const description = toolDisplay.describe(entry);
  const title = description.detail
    ? `${description.title} · ${description.detail}`
    : description.title;
  const waitingForAnswer =
    entry.state === "input-available" && getToolName(entry) === "question";
  const errored = entry.state === "output-error";
  const output = entry.state === "output-available" ? entry.output : undefined;
  const hasAnswerSummary =
    output !== null &&
    typeof output === "object" &&
    (("answers" in output && Array.isArray(output.answers)) ||
      ("skipped" in output && output.skipped === true));

  // An optional question can register without a result to disclose.
  if (!waitingForAnswer && !errored && !hasAnswerSummary) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <MessageCircleQuestionIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </div>
    );
  }

  return (
    <Task defaultOpen={false} className="w-full">
      <TaskTrigger title={title}>
        {triggerRow(MessageCircleQuestionIcon, title)}
      </TaskTrigger>
      <TaskContent>
        {waitingForAnswer ? (
          <p className="text-xs text-muted-foreground/80">
            Awaiting your answer below.
          </p>
        ) : errored ? (
          <ToolOutput output={undefined} errorText={entry.errorText} />
        ) : (
          <AnsweredQuestionSummary entry={entry} />
        )}
      </TaskContent>
    </Task>
  );
}

// `TaskTrigger` renders `children ?? <default SearchIcon row>`, so a custom
// child swaps the action-agnostic search glyph for a per-action icon. Must
// be a single element (the trigger is `asChild`), not a component instance.
function triggerRow(
  Icon: LucideIcon,
  title: string,
  options?: { busy?: boolean; shimmer?: boolean }
) {
  return (
    <button
      type="button"
      className="group/tool-trigger flex w-full cursor-pointer items-center gap-2 text-left text-muted-foreground text-xs transition-colors hover:text-foreground"
    >
      {options?.busy ? (
        <ToolActivitySpinner className="size-3.5 shrink-0" />
      ) : (
        <Icon className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 truncate">
        {options?.shimmer ? (
          <Shimmer as="span" className="max-w-full truncate align-bottom">
            {title}
          </Shimmer>
        ) : (
          title
        )}
      </span>
      <ChevronRightIcon className="size-3 shrink-0 opacity-0 transition-[opacity,transform] duration-150 group-hover/tool-trigger:opacity-50 group-focus-visible/tool-trigger:opacity-50 group-data-[state=open]/tool-trigger:rotate-90 motion-reduce:transition-none" />
    </button>
  );
}

function ToolActivitySpinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("relative inline-block size-3.5 animate-spin", className)}
    >
      {Array.from({ length: 12 }, (_, index) => (
        <span
          key={index}
          className="absolute top-1/2 left-1/2 h-[28%] w-[8%] origin-[50%_175%] rounded-full bg-current"
          style={{
            opacity: (index + 1) / 12,
            transform: `translate(-50%, -175%) rotate(${index * 30}deg)`,
          }}
        />
      ))}
    </span>
  );
}

function iconForAction(action: ToolDisplayDescription["action"]): LucideIcon {
  switch (action) {
    case "read":
      return FileIcon;
    case "edit":
      return FilePenLineIcon;
    case "write":
      return FilePlus2Icon;
    case "list":
      return FolderTreeIcon;
    case "web_search":
    case "search":
    case "tool_search":
      return SearchIcon;
    case "pick_references":
      return ImagesIcon;
    case "view_image":
      return ImageIcon;
    case "generate_image":
      return SparklesIcon;
    case "plan":
      return ListTodoIcon;
    case "command":
    case "process":
      return SquareTerminalIcon;
    case "question":
      return MessageCircleQuestionIcon;
    case "skill":
      return BookOpenIcon;
    case "open_tab":
      return AppWindowIcon;
    case "list_tabs":
      return PanelsTopLeftIcon;
    case "desktop_tool":
      return MonitorIcon;
    case "tool":
      return WrenchIcon;
  }
}
