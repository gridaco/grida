/**
 * Dedicated rendering for the image tools (`view_image`, `generate_image`).
 * Their input/output shapes are known and fixed, so they get their OWN compact
 * UI instead of the generic `ToolInput`/`ToolOutput` JSON view (which would
 * splat a multi-MB base64 string into the transcript):
 *
 *   - view_image      → the viewed path, then the image.
 *   - generate_image  → WHILE GENERATING (it's slow): a skeleton placeholder
 *     with the prompt + a spinner. DONE: the image is the default view; the
 *     prompt (and saved path) reveal on hover.
 *
 * The image bytes are the result's base64 `data` (on the client transcript even
 * when the model-facing view omits/elides them). Kept in the editor kit, which
 * owns the agent's tool vocabulary — the shared `@app/ui` primitives stay
 * tool-agnostic.
 */

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getToolName } from "ai";
import { XIcon } from "lucide-react";
import { Shimmer } from "@app/ui/ai-elements/shimmer";
import { AgentVision } from "@grida/agent/vision";
import type { ToolCallEntry } from "@/lib/agent-chat";

// `@grida/agent/gen` is not a published entrypoint; the tool name is locked
// (AgentGen.TOOL_NAMES.generate_image), matching how this kit refers to
// `run_command`/`question` by their locked literals (see `tool-display.ts`).
const GENERATE_IMAGE = "generate_image";

export function isViewImageEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === AgentVision.TOOL_NAMES.view_image;
}

export function isGenerateImageEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === GENERATE_IMAGE;
}

/** Tools that render as media (path/prompt + image) rather than JSON. */
export function isMediaToolEntry(entry: ToolCallEntry): boolean {
  return isViewImageEntry(entry) || isGenerateImageEntry(entry);
}

/** The call is still in flight — args sent, no result yet. */
export function isMediaPending(entry: ToolCallEntry): boolean {
  return entry.state === "input-streaming" || entry.state === "input-available";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The `data:` URL for the produced/viewed image, or undefined when there's
 * nothing to show (an error result, or bytes absent). Shared by both tools —
 * the ok-result carries base64 `data` + `mime`.
 */
export function mediaImageSrc(entry: ToolCallEntry): string | undefined {
  const out = asRecord("output" in entry ? entry.output : undefined);
  if (out.ok !== true) return undefined;
  const mime = str(out.mime);
  const data = str(out.data);
  return mime && data ? `data:${mime};base64,${data}` : undefined;
}

/** The refusal message for an error result (`ok: false`), if any. */
export function mediaError(entry: ToolCallEntry): string | undefined {
  const out = asRecord("output" in entry ? entry.output : undefined);
  return out.ok === false ? str(out.message) : undefined;
}

/** generate_image's prompt (its input); undefined for view_image. */
export function mediaPrompt(entry: ToolCallEntry): string | undefined {
  if (!isGenerateImageEntry(entry)) return undefined;
  return str(asRecord("input" in entry ? entry.input : undefined).prompt);
}

/** generate_image's image-to-image references, if the call used them. */
export function mediaReferences(entry: ToolCallEntry): string[] {
  if (!isGenerateImageEntry(entry)) return [];
  const references = asRecord(
    "input" in entry ? entry.input : undefined
  ).references;
  return Array.isArray(references)
    ? references.filter((value): value is string => value.length > 0)
    : [];
}

/**
 * The file path to show: generate_image returns the SAVED path in its output;
 * view_image's path is the file it was asked to view (its input).
 */
export function mediaPath(entry: ToolCallEntry): string | undefined {
  if (isGenerateImageEntry(entry)) {
    return str(asRecord("output" in entry ? entry.output : undefined).path);
  }
  return str(asRecord("input" in entry ? entry.input : undefined).path);
}

const imageClass = "max-h-96 max-w-full rounded-md border object-contain";
const ELAPSED_REVEAL_AFTER_MS = 3000;

let bodyLockCount = 0;

function lockBodyScroll() {
  bodyLockCount += 1;
  if (bodyLockCount === 1) {
    document.body.style.overflow = "hidden";
  }
}

function unlockBodyScroll() {
  bodyLockCount = Math.max(0, bodyLockCount - 1);
  if (bodyLockCount === 0) {
    document.body.style.overflow = "";
  }
}

export function FullscreenImagePreview({
  src,
  alt,
  title,
  className,
  children,
}: {
  src: string;
  alt: string;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    lockBodyScroll();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      unlockBodyScroll();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`inline-block max-w-full cursor-zoom-in rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className ?? ""}`}
        onClick={() => setOpen(true)}
        title={title}
      >
        {children}
      </button>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setOpen(false);
              }}
              role="button"
              tabIndex={0}
            >
              <button
                type="button"
                className="absolute top-4 right-4 z-10 rounded-md p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                onClick={() => setOpen(false)}
                title="Close"
              >
                <XIcon className="size-5" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                className="max-h-full max-w-full object-contain"
                decoding="async"
                onClick={(event) => event.stopPropagation()}
              />
            </div>,
            document.body
          )
        : null}
    </>
  );
}

/** `view_image`: the viewed path, then the image (or refusal message). */
function ViewImageBody({ entry }: { entry: ToolCallEntry }): ReactNode {
  const path = mediaPath(entry);
  const src = mediaImageSrc(entry);
  const error = mediaError(entry);
  return (
    <div className="space-y-2 p-4">
      {path && (
        <div
          className="truncate font-mono text-muted-foreground text-xs"
          title={path}
        >
          {path}
        </div>
      )}
      {src ? (
        <FullscreenImagePreview
          src={src}
          alt={path ?? "viewed image"}
          title={path}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={path ?? "viewed image"}
            loading="lazy"
            decoding="async"
            className={imageClass}
          />
        </FullscreenImagePreview>
      ) : error ? (
        <div className="text-muted-foreground text-xs">{error}</div>
      ) : null}
    </div>
  );
}

/**
 * `generate_image`: a producer that takes a while.
 *  - pending → the shimmering prompt, then optional references;
 *  - done    → the image as the default view, the prompt + saved path revealed
 *    on hover (so the transcript stays image-first);
 *  - failed / no bytes → prompt + path + the refusal message.
 */
function GenerateImageBody({ entry }: { entry: ToolCallEntry }): ReactNode {
  const prompt = mediaPrompt(entry);
  const path = mediaPath(entry);
  const src = mediaImageSrc(entry);
  const error = mediaError(entry);
  const references = mediaReferences(entry);

  if (isMediaPending(entry)) {
    return (
      <div className="max-w-full space-y-2 py-1 text-left">
        <PendingPrompt prompt={prompt} />
        <ReferenceStrip references={references} />
      </div>
    );
  }

  if (src) {
    return (
      <div className="space-y-2">
        <FullscreenImagePreview
          src={src}
          alt={prompt ?? "generated image"}
          title={prompt}
        >
          <div className="group/gen relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={prompt ?? "generated image"}
              loading="lazy"
              decoding="async"
              className={imageClass}
            />
            {(prompt || path) && (
              // Image-first by default; the prompt + path fade in on hover.
              <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1 rounded-b-md bg-popover/95 p-2 opacity-0 transition-opacity group-hover/gen:opacity-100">
                {prompt && (
                  <p className="line-clamp-4 text-popover-foreground text-xs">
                    {prompt}
                  </p>
                )}
                {path && (
                  <p
                    className="truncate font-mono text-[10px] text-muted-foreground"
                    title={path}
                  >
                    {path}
                  </p>
                )}
              </div>
            )}
          </div>
        </FullscreenImagePreview>
        <ReferenceStrip references={references} />
      </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      {prompt && <div className="text-foreground text-xs">{prompt}</div>}
      <ReferenceStrip references={references} />
      {path && (
        <div
          className="truncate font-mono text-muted-foreground text-xs"
          title={path}
        >
          {path}
        </div>
      )}
      {error && <div className="text-muted-foreground text-xs">{error}</div>}
    </div>
  );
}

function PendingPrompt({ prompt }: { prompt?: string }): ReactNode {
  const elapsed = useElapsedSeconds();
  return (
    <div className="max-w-prose space-y-0.5">
      {prompt ? (
        <Shimmer as="p" className="max-w-prose text-xs">
          {prompt}
        </Shimmer>
      ) : (
        <Shimmer as="p" className="text-xs">
          Generating image
        </Shimmer>
      )}
      {elapsed * 1000 >= ELAPSED_REVEAL_AFTER_MS && (
        <div className="tabular-nums text-[10px] text-muted-foreground">
          {formatElapsed(elapsed)}
        </div>
      )}
    </div>
  );
}

function ReferenceStrip({ references }: { references: string[] }): ReactNode {
  if (references.length === 0) return null;
  return (
    <div className="flex max-w-full items-center gap-1.5 overflow-x-auto">
      {references.map((reference, index) => {
        const src = renderableReferenceSrc(reference);
        return src ? (
          <FullscreenImagePreview
            key={`${reference}-${index}`}
            src={src}
            alt={`Reference ${index + 1}`}
            title={reference}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`Reference ${index + 1}`}
              loading="lazy"
              decoding="async"
              className="size-9 rounded-sm border object-cover"
            />
          </FullscreenImagePreview>
        ) : (
          <div
            key={`${reference}-${index}`}
            className="max-w-40 truncate rounded-sm border bg-muted/40 px-1.5 py-1 font-mono text-[10px] text-muted-foreground"
            title={reference}
          >
            {reference}
          </div>
        );
      })}
    </div>
  );
}

function renderableReferenceSrc(reference: string): string | undefined {
  if (
    reference.startsWith("data:image/") ||
    reference.startsWith("https://") ||
    reference.startsWith("http://")
  ) {
    return reference;
  }
  return undefined;
}

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

function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

/** The whole image-tool call body — dispatched by tool. No JSON, ever. */
export function MediaToolContent({
  entry,
}: {
  entry: ToolCallEntry;
}): ReactNode {
  return isGenerateImageEntry(entry) ? (
    <GenerateImageBody entry={entry} />
  ) : (
    <ViewImageBody entry={entry} />
  );
}
