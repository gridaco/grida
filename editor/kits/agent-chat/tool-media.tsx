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

import type { ReactNode } from "react";
import { getToolName } from "ai";
import { Loader2Icon } from "lucide-react";
import { Skeleton } from "@app/ui/components/skeleton";
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
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={path ?? "viewed image"}
          loading="lazy"
          decoding="async"
          className={imageClass}
        />
      ) : error ? (
        <div className="text-muted-foreground text-xs">{error}</div>
      ) : null}
    </div>
  );
}

/**
 * `generate_image`: a producer that takes a while.
 *  - pending → a skeleton placeholder with the prompt + spinner (you see WHAT is
 *    being made while you wait);
 *  - done    → the image as the default view, the prompt + saved path revealed
 *    on hover (so the transcript stays image-first);
 *  - failed / no bytes → prompt + path + the refusal message.
 */
function GenerateImageBody({ entry }: { entry: ToolCallEntry }): ReactNode {
  const prompt = mediaPrompt(entry);
  const path = mediaPath(entry);
  const src = mediaImageSrc(entry);
  const error = mediaError(entry);

  if (isMediaPending(entry)) {
    return (
      <div className="relative flex min-h-40 w-full items-center justify-center overflow-hidden rounded-md border p-4">
        <Skeleton className="absolute inset-0 rounded-md" />
        <div className="relative flex flex-col items-center gap-2 text-center">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          {prompt && (
            <span className="line-clamp-3 max-w-prose text-muted-foreground text-xs">
              {prompt}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (src) {
    return (
      <div className="group/gen relative inline-block max-w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={prompt ?? "generated image"}
          title={prompt}
          loading="lazy"
          decoding="async"
          className={imageClass}
        />
        {(prompt || path) && (
          // Image-first by default; the prompt + path fade in on hover.
          // `pointer-events-none` so the overlay never blocks interaction.
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
    );
  }

  return (
    <div className="space-y-2 p-4">
      {prompt && <div className="text-foreground text-xs">{prompt}</div>}
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
