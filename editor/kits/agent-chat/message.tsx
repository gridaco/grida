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
 *   - `Shimmer` — pre-content "Thinking" indicator before any part has
 *     streamed for this turn.
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
  type ReactNode,
} from "react";
import { isFileUIPart, isTextUIPart, type FileUIPart } from "ai";
import {
  CONTEXT_MARKERS,
  USER_DIRECTORY_REFERENCES,
  USER_FILE_ATTACHMENTS,
  USER_TEMPLATE_SELECTION,
} from "@grida/agent";
import { cn } from "@app/ui/lib/utils";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  FolderTreeIcon,
  GitBranchIcon,
  ImageIcon,
  LayoutTemplateIcon,
  ListTodoIcon,
  MessageCircleQuestionIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SearchIcon,
  SparklesIcon,
  SquareTerminalIcon,
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
import { ToolOutput } from "@app/ui/ai-elements/tool";
import { Task, TaskContent, TaskTrigger } from "@app/ui/ai-elements/task";
// Message/tool types stay in the shared `@/lib/agent-chat` seam (the
// bridge transport + session helpers use them too); `toolDisplay` is
// this renderer's own label/summary formatting, colocated in the kit.
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";
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

export type { ChatMessage, ToolCallEntry };

const markdown = {
  className: "grida-ai-response-markdown space-y-2 text-[13px] leading-6",
  controls: {
    code: { copy: true, download: false },
    table: { copy: true, download: false, fullscreen: false },
  },
  plugins: { cjk, code, math, mermaid },
} as const;

/**
 * Shared class string for the hover/focus-revealed action rows (copy /
 * rewind / branch). The `pointer-events-none` while hidden is the important
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
  /** Soft-truncate the conversation to this user message (RFC `rewinding`). */
  onRewind?: (messageId: string) => void;
  /** Fork a new session at this user message (RFC `fork`). */
  onFork?: (messageId: string) => void;
  /** Disable the actions (e.g. while a run is in flight). */
  disabled?: boolean;
};

export function ChatMessageView({
  message,
  isStreaming,
  actions,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
  /** Per-turn affordances rendered under user bubbles. Omit to hide. */
  actions?: ChatMessageActions;
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
    // Inline image attachments the user pasted/dropped (perceive-only `file`
    // parts). Rendered as thumbnails in the bubble so the sent message mirrors
    // what the model received.
    const images = message.parts.filter(
      (part): part is FileUIPart =>
        isFileUIPart(part) && part.mediaType.startsWith("image/")
    );
    // Registered context tokens (WG `compositor.md` §templating) the host
    // attached on the user's behalf — e.g. a picked template. Rendered as a chip
    // (the USER view) so the context is visible WITHOUT being fabricated into the
    // user's prose. Same array live + DB-rebuilt (reads `message.parts`).
    const contexts = message.parts.filter(
      (part) =>
        typeof (part as { type?: unknown }).type === "string" &&
        (part as { type: string }).type in CONTEXT_MARKERS
    );
    return (
      <Message from="user">
        <MessageContent className="text-[13px]">
          <CollapsibleBubbleBody>
            {contexts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {contexts.map((rawPart, index) => {
                  // `data-*` context part — read past the closed UIMessagePart
                  // union; the filter above already gated `type` to CONTEXT_MARKERS.
                  const part = rawPart as {
                    type: string;
                    data?: Record<string, unknown>;
                  };
                  const isTemplate = part.type === USER_TEMPLATE_SELECTION;
                  const isFiles = part.type === USER_FILE_ATTACHMENTS;
                  const isDirectories = part.type === USER_DIRECTORY_REFERENCES;
                  const d = part.data ?? {};
                  const title =
                    typeof d.title === "string" ? d.title : undefined;
                  const slides =
                    typeof d.slides === "number" ? d.slides : undefined;
                  // Uploaded-file marker: name the chip by the file(s) in scratch.
                  const fileNames = (
                    Array.isArray(d.files) ? d.files : []
                  ).flatMap((f) =>
                    f && typeof (f as { name?: unknown }).name === "string"
                      ? [(f as { name: string }).name]
                      : []
                  );
                  const directoryNames = (
                    Array.isArray(d.directories) ? d.directories : []
                  ).flatMap((directory) =>
                    directory &&
                    typeof (directory as { name?: unknown }).name === "string"
                      ? [(directory as { name: string }).name]
                      : []
                  );
                  const Icon = isTemplate
                    ? LayoutTemplateIcon
                    : isDirectories
                      ? FolderTreeIcon
                      : PaperclipIcon;
                  const label =
                    isTemplate && title
                      ? `${title} template`
                      : isFiles
                        ? fileNames.length === 1
                          ? fileNames[0]
                          : `${fileNames.length} files`
                        : isDirectories
                          ? directoryNames.length === 1
                            ? directoryNames[0]
                            : `${directoryNames.length} folders`
                          : CONTEXT_MARKERS[part.type];
                  return (
                    // Index key: a sent user message's parts are immutable and
                    // never reorder (same reasoning as the images below).
                    <span
                      key={index}
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
                    >
                      <Icon className="size-3.5 text-muted-foreground" />
                      <span className="font-medium">{label}</span>
                      {isTemplate && slides !== undefined && (
                        <span className="text-muted-foreground">
                          · {slides} slides
                        </span>
                      )}
                      {isDirectories && (
                        <span className="text-muted-foreground">
                          · read only
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((image, index) => (
                  // Index key: a sent user message's attachments are immutable
                  // and never reorder, so the index is stable — and it avoids
                  // putting a multi-MB data-URL into the key (which React keeps
                  // + compares).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={index}
                    src={image.url}
                    alt={image.filename ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="max-h-48 max-w-full rounded-md border object-contain"
                  />
                ))}
              </div>
            )}
            {text.length > 0 && (
              <MessageResponse plugins={markdown.plugins}>
                {text}
              </MessageResponse>
            )}
          </CollapsibleBubbleBody>
        </MessageContent>
        {/* Subtle until hover so the transcript stays clean; right-aligned
            to sit under the user bubble. Copy is always available (a pure
            clipboard action, never disabled); rewind/fork appear only
            when the host wires them. */}
        <MessageActions className={`ml-auto ${revealOnHoverActions}`}>
          <CopyMessageAction text={text} />
          {actions?.onRewind && (
            <MessageAction
              tooltip="Rewind to here"
              disabled={actions.disabled}
              onClick={() => actions.onRewind?.(message.id)}
            >
              <RotateCcwIcon />
            </MessageAction>
          )}
          {actions?.onFork && (
            <MessageAction
              tooltip="Fork from here"
              disabled={actions.disabled}
              onClick={() => actions.onFork?.(message.id)}
            >
              <GitBranchIcon />
            </MessageAction>
          )}
        </MessageActions>
      </Message>
    );
  }

  // Assistant messages fill the available width — the bubble framing
  // is reserved for user messages, the assistant's response flows like
  // a document. Matches the web panel's `w-full max-w-none` on
  // `<Message from="assistant">`.
  const groups = groupMessageParts(message);
  const hasVisibleContent = groups.length > 0;
  // Copyable response = the assistant's visible text only (non-text parts are
  // excluded). Multiple text parts can be split by tool
  // calls, so rejoin them with blank lines to preserve paragraph breaks.
  const responseText = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n");
  return (
    <Message from="assistant" className="w-full max-w-none">
      <MessageContent className="w-full max-w-full text-[13px]">
        {groups.map((group) => {
          if (group.type === "text") {
            return (
              <MessageResponse
                key={group.key}
                className={markdown.className}
                controls={markdown.controls}
                plugins={markdown.plugins}
              >
                {group.text}
              </MessageResponse>
            );
          }
          return <ToolCallGroupView key={group.key} entries={group.entries} />;
        })}
        {isStreaming && !hasVisibleContent && (
          <Shimmer className="text-xs">Thinking</Shimmer>
        )}
      </MessageContent>
      {/* Copy mirrors the user-bubble affordance but left-aligned under the
          assistant response. Shown only once the turn has settled with real
          text — never over a half-streamed or tool-only (text-less) turn. */}
      {!isStreaming && responseText.trim().length > 0 && (
        <MessageActions className={revealOnHoverActions}>
          <CopyMessageAction text={responseText} />
        </MessageActions>
      )}
    </Message>
  );
}

/**
 * Height (px) a user bubble is clamped to before the "Show more" affordance
 * kicks in. Roughly ten lines at the bubble's `leading-6` — tall enough that
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
    // Re-measure on reflow — a late-loading image or a window resize can flip
    // a bubble across the threshold after the first paint.
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
 * Horizontal divider with centered content — the section break that marks a
 * compaction in the transcript. Shared by the in-flight indicator
 * ({@link CompactingIndicator}) and the settled notice
 * ({@link CompactionNotice}) so the two states sit on one consistent line.
 */
function CompactionDivider({ children }: { children: ReactNode }) {
  return (
    <div className="my-3 flex w-full items-center gap-3 px-1 text-muted-foreground">
      <span aria-hidden className="h-px flex-1 bg-border" />
      {children}
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

/**
 * How long an in-flight indicator runs bare before the elapsed-time counter
 * appears, in milliseconds. Below this only the shimmering label shows; at or
 * past it the "· {time}" counter is revealed.
 */
const ELAPSED_REVEAL_AFTER_MS = 3000;

/**
 * A shimmering label trailed by a live elapsed-time counter — the shared body
 * of the transcript's in-flight indicators ({@link CompactingIndicator},
 * {@link PendingTurnIndicator}) so they tick identically.
 *
 * The counter stays hidden for the first {@link ELAPSED_REVEAL_AFTER_MS}: a fast
 * operation settles before a timer grows, and only a wait long enough to feel
 * slow surfaces the elapsed time as reassurance.
 *
 * The counter is a sibling of the `Shimmer`, not its child: `Shimmer` requires a
 * string child and recreates its motion element whenever that child changes, so
 * feeding it the ticking label would restart the shimmer every second.
 */
function ShimmerWithElapsed({ label }: { label: string }) {
  const elapsed = useElapsedSeconds();
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
      <Shimmer as="span">{label}</Shimmer>
      {elapsed * 1000 >= ELAPSED_REVEAL_AFTER_MS && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{formatElapsed(elapsed)}</span>
        </>
      )}
    </span>
  );
}

/**
 * In-flight compaction (RFC `session / compaction`). A divider whose centered
 * label shimmers while the summarizer runs, trailed by a live elapsed-time
 * counter so a slow summarize reads as progress, not a hang. The host renders
 * this at the tail of the conversation while a manual `/compact` is awaiting;
 * once the summary message hydrates it is replaced by the settled
 * {@link CompactionNotice}.
 */
export function CompactingIndicator() {
  return (
    <CompactionDivider>
      <ShimmerWithElapsed label="Compacting conversation" />
    </CompactionDivider>
  );
}

/**
 * Pre-first-token indicator — the dead-air window between a send and the first
 * streamed chunk. The AI-SDK reducer doesn't create the assistant message until
 * the first content chunk arrives, so the per-turn "Thinking" shimmer that lives
 * inside the assistant bubble ({@link ChatMessageView}) has nothing to mount on
 * yet. A surface renders this at the transcript tail while a turn is in flight
 * and no assistant turn has begun (`isStreaming && last message is not the
 * assistant`); it's framed as an assistant turn so it sits exactly where the
 * real response will, then is replaced by it the moment the first chunk lands.
 */
export function PendingTurnIndicator() {
  return (
    <Message from="assistant" className="w-full max-w-none">
      <MessageContent className="w-full max-w-full">
        <ShimmerWithElapsed label="Thinking" />
      </MessageContent>
    </Message>
  );
}

/**
 * Transient confirmation that a fork happened (RFC `session / fork`). Forking
 * switches to a copy that looks identical to the source, so without this the
 * action reads as a no-op. A surface renders it while
 * `useSessionFork().justForked` is true; it auto-dismisses there.
 */
export function ForkedNotice() {
  return (
    <div className="flex items-center gap-2 border-t bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex-1">
        Forked into a new session — you&apos;re now in a copy.
      </span>
    </div>
  );
}

// The settled compaction affordance (RFC `session / compaction`: "the user
// sees a one-line affordance"). A divider reading "Conversation compacted";
// clicking the label expands the summary the model now sees in place of the
// hidden turns.
function CompactionNotice({
  summary,
  auto,
}: {
  summary: string;
  auto: boolean;
}) {
  return (
    <details className="group/compaction my-3 w-full">
      <summary className="flex w-full cursor-pointer list-none items-center gap-3 px-1 text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5 whitespace-nowrap text-xs transition-colors hover:text-foreground">
          {auto ? "Conversation auto-compacted" : "Conversation compacted"}
          <ChevronDownIcon className="size-3 shrink-0 opacity-50 transition-transform group-open/compaction:rotate-180" />
        </span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </summary>
      <div className="mt-2 whitespace-pre-wrap rounded-md border bg-muted/40 p-2 text-xs leading-5 text-foreground/80">
        {summary}
      </div>
    </details>
  );
}

// A lone tool call renders as a single `Task` row; a run of consecutive
// calls nests those rows inside one summary `Task`.
function ToolCallGroupView({ entries }: { entries: ToolCallEntry[] }) {
  if (entries.length === 1) {
    return <ToolCallView entry={entries[0]} />;
  }

  const summary = toolDisplay.summarize(entries);
  return (
    <Task defaultOpen={false} className="w-full">
      <TaskTrigger title={summary}>
        {triggerRow(groupIcon(entries), summary)}
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

function ToolCallView({ entry }: { entry: ToolCallEntry }) {
  // The `question` tool's INTERACTIVE prompt is session-global (pinned above the
  // composer by the surface — see `findPendingQuestion` / `QuestionCard`). In
  // the transcript it's only a passive record of what was asked / answered.
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
          {triggerRow(iconForAction(description.action), title)}
        </TaskTrigger>
        <TaskContent>
          <DesignSearchContent entry={entry} />
        </TaskContent>
      </Task>
    );
  }
  const mediaTool = isMediaToolEntry(entry);
  const humanReadableTool = isHumanReadableToolCardEntry(entry);
  // The Allow/Deny ACTION lives in the session-global approval bar above the
  // composer (instantly visible). Here we only echo the status passively so the
  // transcript shows which call is awaiting / was approved / was denied.
  const approval = approvalOf(entry);
  const showTriggerSpinner =
    isGenerateImageEntry(entry) && isMediaPending(entry);

  return (
    <Task defaultOpen={mediaTool || humanReadableTool} className="w-full">
      <TaskTrigger title={title}>
        {triggerRow(iconForAction(description.action), title, {
          busy: showTriggerSpinner,
        })}
      </TaskTrigger>
      {mediaTool ? (
        <TaskContent>
          <MediaToolContent entry={entry} />
        </TaskContent>
      ) : (
        <TaskContent>
          <ToolCardContent entry={entry} approval={approval} />
        </TaskContent>
      )}
    </Task>
  );
}

// The `question` tool's PASSIVE transcript record. The interactive prompt is
// session-global (the surface pins `QuestionCard` above its composer), so here
// we only show what was asked — a one-line header — and, once answered, the
// read-only echo of the answer. While the run is paused on the user the header
// points them at the prompt; `input-streaming` (partial input) shows nothing.
function QuestionToolView({ entry }: { entry: ToolCallEntry }) {
  const description = toolDisplay.describe(entry);
  const title = description.detail
    ? `${description.title} · ${description.detail}`
    : description.title;
  if (entry.state === "input-streaming") return null;
  const pending = entry.state === "input-available";
  // A `question` part can be `output-error` — a headless host's fixed refusal
  // (RFC §question), or any tool error. Surface its text rather than the empty
  // answered summary, so the refusal/error isn't silently swallowed.
  const errored = entry.state === "output-error";
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <MessageCircleQuestionIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
      </div>
      {pending ? (
        <p className="mt-1 text-xs text-muted-foreground/80">
          Awaiting your answer below.
        </p>
      ) : errored ? (
        <ToolOutput output={undefined} errorText={entry.errorText} />
      ) : (
        <AnsweredQuestionSummary entry={entry} />
      )}
    </div>
  );
}

// `TaskTrigger` renders `children ?? <default SearchIcon row>`, so a custom
// child swaps the action-agnostic search glyph for a per-action icon. Must
// be a single element (the trigger is `asChild`), not a component instance.
function triggerRow(
  Icon: LucideIcon,
  title: string,
  options?: { busy?: boolean }
) {
  return (
    <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground">
      {options?.busy ? (
        <ToolActivitySpinner className="size-3.5 shrink-0" />
      ) : (
        <Icon className="size-3.5 shrink-0" />
      )}
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <ChevronDownIcon className="size-3 shrink-0 opacity-50 transition-transform group-data-[state=open]:rotate-180" />
    </div>
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
    case "search":
      return SearchIcon;
    case "view_image":
      return ImageIcon;
    case "generate_image":
      return SparklesIcon;
    case "plan":
      return ListTodoIcon;
    case "command":
      return SquareTerminalIcon;
    case "question":
      return MessageCircleQuestionIcon;
    case "skill":
      return BookOpenIcon;
    case "tool":
      return WrenchIcon;
  }
}

// Uniform runs (3 reads) keep the shared action icon; mixed runs fall back
// to a generic wrench.
function groupIcon(entries: ToolCallEntry[]): LucideIcon {
  const first = toolDisplay.describe(entries[0]).action;
  const uniform = entries.every(
    (entry) => toolDisplay.describe(entry).action === first
  );
  return uniform ? iconForAction(first) : WrenchIcon;
}
