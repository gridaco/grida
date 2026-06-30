/**
 * Dedicated rendering for the image tools (`view_image`, `generate_image`).
 * Their input/output shapes are known and fixed, so they get their OWN compact
 * UI instead of the generic `ToolInput`/`ToolOutput` JSON view (which would
 * splat a multi-MB base64 string into the transcript):
 *
 *   - view_image      → the viewed path, then the image.
 *   - generate_image  → the prompt, then the saved path, then the image.
 *
 * The image bytes are the result's base64 `data` (on the client transcript even
 * when the model-facing view omits/elides them). Kept in the editor kit, which
 * owns the agent's tool vocabulary — the shared `@app/ui` primitives stay
 * tool-agnostic.
 */

import type { ReactNode } from "react";
import { getToolName } from "ai";
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

/**
 * The whole image-tool call body — prompt (generate_image only), then path,
 * then the image. No JSON. On an error result the path/prompt show with the
 * refusal message instead of an image; while the call is still running (no
 * output yet) only the prompt/path show.
 */
export function MediaToolContent({
  entry,
}: {
  entry: ToolCallEntry;
}): ReactNode {
  const prompt = mediaPrompt(entry);
  const path = mediaPath(entry);
  const src = mediaImageSrc(entry);
  const error = mediaError(entry);
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
      {src ? (
        // A base64 data: URL of agent-produced bytes — `next/image` adds nothing
        // (no remote optimization, dynamic dims). Same as the user-image
        // `<img>` in `message.tsx`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={prompt ?? path ?? "image"}
          loading="lazy"
          decoding="async"
          className="max-h-96 max-w-full rounded-md border object-contain"
        />
      ) : error ? (
        <div className="text-muted-foreground text-xs">{error}</div>
      ) : null}
    </div>
  );
}
