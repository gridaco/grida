/**
 * `@/kits/agent-chat` renderer — one chat turn (user or assistant),
 * render-only and props-driven. Built on the repo's
 * `@app/ui/ai-elements/*` primitives so every agent chat surface
 * (desktop sidebar, workspace pane, demo) shares one look:
 *
 *   - `Message` / `MessageContent` / `MessageResponse` — role-aware
 *     bubble framing with Streamdown-backed Markdown rendering.
 *   - `Reasoning` — collapsible "thinking" block for reasoning parts.
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

import { useEffect, useState, type ReactNode } from "react";
import { isFileUIPart, isTextUIPart, type FileUIPart } from "ai";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  EyeIcon,
  FilePenLineIcon,
  FilePlus2Icon,
  FolderTreeIcon,
  GitBranchIcon,
  ListTodoIcon,
  RotateCcwIcon,
  SearchIcon,
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
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@app/ui/ai-elements/reasoning";
import { Shimmer } from "@app/ui/ai-elements/shimmer";
import { ToolInput, ToolOutput } from "@app/ui/ai-elements/tool";
import { Task, TaskContent, TaskTrigger } from "@app/ui/ai-elements/task";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "@app/ui/ai-elements/confirmation";
// Message/tool types stay in the shared `@/lib/agent-chat` seam (the
// bridge transport + session helpers use them too); `toolDisplay` is
// this renderer's own label/summary formatting, colocated in the kit.
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";
import { toolDisplay, type ToolDisplayDescription } from "./tool-display";
import { groupMessageParts } from "./group-parts";

export type { ChatMessage, ToolCallEntry };

const markdown = {
  className: "grida-ai-response-markdown space-y-2 text-sm leading-6",
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
    return (
      <Message from="user">
        <MessageContent>
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, index) => (
                // Index key: a sent user message's attachments are immutable and
                // never reorder, so the index is stable — and it avoids putting a
                // multi-MB data-URL into the key (which React keeps + compares).
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
            <MessageResponse plugins={markdown.plugins}>{text}</MessageResponse>
          )}
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
  const hasContent = message.parts.length > 0;
  const groups = groupMessageParts(message);
  // Copyable response = the assistant's visible text only (reasoning and
  // tool calls are excluded). Multiple text parts can be split by tool
  // calls, so rejoin them with blank lines to preserve paragraph breaks.
  const responseText = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("\n\n");
  return (
    <Message from="assistant" className="w-full max-w-none">
      <MessageContent className="w-full max-w-full">
        {groups.map((group, groupIndex) => {
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
          if (group.type === "reasoning") {
            return (
              <Reasoning
                key={group.key}
                isStreaming={
                  Boolean(isStreaming) && groupIndex === groups.length - 1
                }
              >
                <ReasoningTrigger />
                <ReasoningContent>{group.text}</ReasoningContent>
              </Reasoning>
            );
          }
          return <ToolCallGroupView key={group.key} entries={group.entries} />;
        })}
        {isStreaming && !hasContent && (
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
 * Seconds elapsed since mount, ticking once a second. The host renders
 * {@link CompactingIndicator} only while a compaction is in flight, so
 * "since mount" == "since the run started". Diffs `Date.now()` rather than
 * incrementing a counter so a throttled/slept tab catches up instead of
 * drifting. Reads no clock during render (effect-only) — no SSR/hydration skew.
 */
function useElapsedSeconds(): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

/** `73` → `"1m 13s"`; under a minute drops the `0m` part: `42` → `"42s"`. */
function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/**
 * In-flight compaction (RFC `session / compaction`). A divider whose centered
 * label shimmers while the summarizer runs, trailed by a live elapsed-time
 * counter so a slow summarize reads as progress, not a hang. The host renders
 * this at the tail of the conversation while a manual `/compact` is awaiting;
 * once the summary message hydrates it is replaced by the settled
 * {@link CompactionNotice}.
 *
 * The timer is a sibling of the shimmer, not inside it: `Shimmer` requires a
 * string child and recreates its motion element whenever that child changes,
 * so feeding it the ticking label would restart the shimmer every second.
 *
 * The counter stays hidden for the first few seconds: a fast compaction never
 * grows a timer (the indicator settles before it appears), and only a wait long
 * enough to feel slow surfaces the elapsed time as reassurance.
 */

/**
 * How long the indicator runs bare before the elapsed-time counter appears,
 * in milliseconds. Below this, only the "Compacting conversation" shimmer
 * shows; at or past it the "· {time}" counter is revealed.
 */
const ELAPSED_REVEAL_AFTER_MS = 3000;

export function CompactingIndicator() {
  const elapsed = useElapsedSeconds();
  return (
    <CompactionDivider>
      <span className="flex items-center gap-1.5 whitespace-nowrap text-xs">
        <Shimmer as="span">Compacting conversation</Shimmer>
        {elapsed * 1000 >= ELAPSED_REVEAL_AFTER_MS && (
          <>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatElapsed(elapsed)}</span>
          </>
        )}
      </span>
    </CompactionDivider>
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
        {entries.map((entry) => (
          <ToolCallView key={entry.toolCallId} entry={entry} />
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
  const description = toolDisplay.describe(entry);
  const title = description.detail
    ? `${description.title} · ${description.detail}`
    : description.title;
  const hasInput = entry.input !== undefined;
  const hasOutput = entry.output !== undefined || Boolean(entry.errorText);
  // The Allow/Deny ACTION lives in the session-global approval bar above the
  // composer (instantly visible). Here we only echo the status passively so the
  // transcript shows which call is awaiting / was approved / was denied.
  const approval = approvalOf(entry);

  return (
    <Task defaultOpen={false} className="w-full">
      <TaskTrigger title={title}>
        {triggerRow(iconForAction(description.action), title)}
      </TaskTrigger>
      {(hasInput || hasOutput || approval) && (
        <TaskContent>
          {hasInput && <ToolInput input={entry.input} />}
          {approval && (
            <Confirmation
              approval={approval}
              state={entry.state}
              className="mt-2"
            >
              <ConfirmationRequest>
                <ConfirmationTitle>
                  Awaiting your approval (see the prompt above the composer).
                </ConfirmationTitle>
              </ConfirmationRequest>
              <ConfirmationAccepted>
                <ConfirmationTitle>Approved.</ConfirmationTitle>
              </ConfirmationAccepted>
              <ConfirmationRejected>
                <ConfirmationTitle>Denied — not run.</ConfirmationTitle>
              </ConfirmationRejected>
            </Confirmation>
          )}
          <ToolOutput output={entry.output} errorText={entry.errorText} />
        </TaskContent>
      )}
    </Task>
  );
}

// `TaskTrigger` renders `children ?? <default SearchIcon row>`, so a custom
// child swaps the action-agnostic search glyph for a per-action icon. Must
// be a single element (the trigger is `asChild`), not a component instance.
function triggerRow(Icon: LucideIcon, title: string) {
  return (
    <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-xs transition-colors hover:text-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <ChevronDownIcon className="size-3 shrink-0 opacity-50 transition-transform group-data-[state=open]:rotate-180" />
    </div>
  );
}

function iconForAction(action: ToolDisplayDescription["action"]): LucideIcon {
  switch (action) {
    case "read":
      return EyeIcon;
    case "edit":
      return FilePenLineIcon;
    case "write":
      return FilePlus2Icon;
    case "list":
      return FolderTreeIcon;
    case "search":
      return SearchIcon;
    case "plan":
      return ListTodoIcon;
    case "command":
      return SquareTerminalIcon;
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
