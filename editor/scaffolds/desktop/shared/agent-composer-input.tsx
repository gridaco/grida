"use client";

/**
 * `AgentComposerInput` — the desktop agent chat's input, built on the
 * `@/kits/composer` Tiptap kit. Replaces the plain `PromptInputTextarea`
 * so the chat input gains slash `/` commands (skills) and `@` mentions
 * (workspace file references), plus light rich text.
 *
 * Headless-ish: the caller supplies the `catalog` (commands + mentions)
 * and a `toolbar` (e.g. the model picker), and receives the lowered
 * prompt text on submit. The composer owns trigger state + editing; this
 * component owns the surrounding frame + send/stop affordances.
 *
 * Lowering: the prompt is `message.meta.text` plus an explicit list of
 * any referenced file paths (from `@`-mentions / file-ref parts) so the
 * agent can resolve them even when the chip text alone is ambiguous.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowUpIcon, SquareIcon } from "lucide-react";
import type { FileUIPart } from "ai";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  ComposerAttachmentCards,
  ComposerContent,
  ComposerProvider,
  ComposerTriggerMenu,
  useComposer,
  type ComposerCatalog,
  type ComposerMessage,
} from "@/kits/composer";
import { encodeImageFile, toFileUiParts } from "@/lib/agent-chat";

/**
 * A `/`-command that runs an action (e.g. `/compact`) instead of being
 * lowered into the prompt. Shown in the trigger menu; intercepted on
 * submit. Distinct from skill commands, which become a prompt hint.
 */
export type ComposerCommandAction = {
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
};

export type AgentComposerInputProps = {
  catalog: ComposerCatalog;
  /** Action `/`-commands (e.g. `/compact`). Merged into the menu, ahead
   *  of the catalog's own commands, and intercepted on submit. */
  commandActions?: ComposerCommandAction[];
  /**
   * Receives the lowered prompt text plus any inlined image attachments as
   * AI-SDK `file` parts (perceive-only). Empty submissions (no text AND no
   * files) are filtered.
   */
  onSubmit: (text: string, files?: FileUIPart[]) => void | Promise<void>;
  isStreaming: boolean;
  onStop: () => void;
  placeholder?: string;
  autofocus?: boolean;
  /**
   * Whether the active model accepts image input. When false, pasted/dropped
   * images are rejected at ingest (with a notice) and stripped at submit.
   * Defaults to `true`.
   */
  multimodal?: boolean;
  /** Left-aligned footer content (e.g. the model picker). */
  toolbar?: ReactNode;
  className?: string;
};

export function AgentComposerInput({
  catalog,
  commandActions,
  ...rest
}: AgentComposerInputProps) {
  // Surface action commands in the `/` menu alongside catalog commands.
  const effectiveCatalog = useMemo<ComposerCatalog>(() => {
    if (!commandActions || commandActions.length === 0) return catalog;
    const actionCommands = commandActions.map((a) => ({
      id: a.id,
      title: a.title,
      description: a.description,
    }));
    return {
      commands: [...actionCommands, ...catalog.commands],
      mentions: catalog.mentions,
    };
  }, [catalog, commandActions]);

  return (
    <ComposerProvider catalog={effectiveCatalog}>
      <AgentComposerInner commandActions={commandActions} {...rest} />
    </ComposerProvider>
  );
}

function AgentComposerInner({
  commandActions,
  onSubmit,
  isStreaming,
  onStop,
  placeholder = "Ask anything…",
  autofocus,
  multimodal = true,
  toolbar,
  className,
}: Omit<AgentComposerInputProps, "catalog">) {
  const composer = useComposer();
  const { addAttachment } = composer;

  const actionById = useMemo(() => {
    const map = new Map<string, ComposerCommandAction>();
    for (const a of commandActions ?? []) map.set(a.id, a);
    return map;
  }, [commandActions]);

  // Minimal, neutral inline feedback for the two cases that would otherwise do
  // nothing visible: a non-vision model, or attempting to queue images.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string | null) => {
    setNotice(msg);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    if (msg) noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);
  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    []
  );

  // Paste / drop image files → inline as perceive-only attachments. The model
  // sees pixels, not a path; downscale/cap + SVG/non-image rejection live in
  // `encodeImageFile`.
  const onImageFiles = useCallback(
    async (files: File[]) => {
      if (!multimodal) {
        notify("This model can't read images.");
        return;
      }
      // Encode concurrently — each file is independent, so a multi-image paste
      // shouldn't serialize on the slowest one. Drop the ones that failed or
      // were rejected (encodeImageFile returns null).
      const encoded = (
        await Promise.all(files.map((file) => encodeImageFile(file)))
      ).filter((item) => item !== null);
      for (const item of encoded) {
        addAttachment({
          name: item.name,
          mime: item.mime,
          size: item.size,
          url: item.url,
        });
      }
      // Feedback: clear the gate notice once an image lands; if every file
      // failed to encode (corrupt, or unsupported like SVG), say so rather than
      // silently swallowing the paste.
      if (encoded.length > 0) {
        notify(null);
      } else {
        notify("Couldn't add the image — it may be corrupted or unsupported.");
      }
    },
    [multimodal, addAttachment, notify]
  );

  const submit = () => {
    // No blanket `isStreaming` early-return: submitting WHILE a turn streams is
    // how a TEXT message gets queued (RFC `queue`). Images are the exception —
    // the turn queue persists text only, so image sends need an idle session.
    const message = composer.submit({ submitted_at: Date.now() });
    if (!message) return;
    // Intercept action commands (`/compact`, …) — run them instead of
    // sending a normal turn.
    const actions = message.parts
      .filter((p) => p.type === "command")
      .map((p) => (p as { id: string }).id)
      .filter((id) => actionById.has(id));
    if (actions.length > 0) {
      composer.clear();
      for (const id of actions) void actionById.get(id)!.run();
      return;
    }
    const text = lowerPrompt(message);
    // Image attachments the user added; stripped when the model can't see them
    // (e.g. switched to a non-multimodal model after attaching).
    const images = toFileUiParts(message.parts);
    const files = multimodal ? images : [];
    // `files` empties while `images` doesn't only when the model can't read
    // them — track it so neither the only-images nor the text+images path drops
    // attachments silently.
    const droppedImages = images.length > 0 && files.length === 0;
    if (!text.trim() && files.length === 0) {
      if (droppedImages) notify("This model can't read images.");
      return;
    }
    // Images can't ride the text-only queue: block while busy (don't clear, so
    // the user keeps their attachments) until the session is idle.
    if (isStreaming && files.length > 0) {
      notify("Can't queue images — wait for the current turn.");
      return;
    }
    composer.clear();
    // Text still sends; if images were stripped (non-vision model) say so rather
    // than dropping them silently. Otherwise clear any stale notice.
    notify(
      droppedImages ? "Images weren't sent — this model can't read them." : null
    );
    void onSubmit(text, files.length > 0 ? files : undefined);
  };

  return (
    <div
      className={cn(
        "relative rounded-lg border bg-accent transition-colors",
        className
      )}
    >
      <ComposerTriggerMenu />
      <ComposerContent
        autofocus={autofocus}
        onSubmitRequest={submit}
        onImageFiles={onImageFiles}
        placeholder={placeholder}
        className="px-3 pt-2"
        editorClassName="min-h-9 max-h-48 overflow-y-auto text-sm"
      />
      <ComposerAttachmentCards className="px-3 pb-1" />
      {notice && (
        <p className="px-3 pb-1 text-xs text-muted-foreground">{notice}</p>
      )}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        {toolbar}
        <div className="ml-auto">
          {isStreaming ? (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={onStop}
              aria-label="Stop"
            >
              <SquareIcon className="size-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon-sm"
              className="rounded-full"
              onClick={submit}
              aria-label="Send"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Build the prompt text the agent receives. Starts from the composer's
 * plain text, then appends:
 *   - any referenced file paths (`@`-mentions / file-refs) as an explicit
 *     list so the agent can resolve them, and
 *   - any `/`-command (skill) requests as a hint so the agent loads the
 *     named skill via its `skill` tool.
 */
function lowerPrompt(message: ComposerMessage): string {
  const paths = new Set<string>();
  const skills = new Set<string>();
  for (const part of message.parts) {
    if (part.type === "mention" && part.target.path) {
      paths.add(part.target.path);
    } else if (part.type === "file-ref") {
      paths.add(part.ref.path);
    } else if (part.type === "command") {
      skills.add(part.id);
    }
  }
  const sections = [message.meta.text.trim()];
  if (paths.size > 0) {
    sections.push(
      `Referenced files:\n${[...paths].map((p) => `- ${p}`).join("\n")}`
    );
  }
  if (skills.size > 0) {
    sections.push(`Use these skills: ${[...skills].join(", ")}.`);
  }
  return sections.filter((s) => s.length > 0).join("\n\n");
}
