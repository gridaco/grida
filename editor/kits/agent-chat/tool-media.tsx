/**
 * Dedicated rendering for the `view_image` tool result. Its input/output shape
 * is known and fixed, so it gets its OWN compact UI — the path, then the image
 * — instead of the generic `ToolInput`/`ToolOutput` JSON view (which would splat
 * a multi-MB base64 string into the transcript). Kept in the editor kit (which
 * owns the agent's tool vocabulary), not in the shared `@app/ui` primitives.
 */

import type { ReactNode } from "react";
import { getToolName } from "ai";
import { AgentVision } from "@grida/agent/vision";
import type { ToolCallEntry } from "@/lib/agent-chat";

export function isViewImageEntry(entry: ToolCallEntry): boolean {
  return getToolName(entry) === AgentVision.TOOL_NAMES.view_image;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

/** The file the call viewed (from the tool input). */
export function viewImagePath(entry: ToolCallEntry): string | undefined {
  const path = asRecord("input" in entry ? entry.input : undefined).path;
  return typeof path === "string" && path.length > 0 ? path : undefined;
}

/**
 * The `data:` URL for the viewed image, or undefined when there's nothing to
 * show (an error result, or bytes absent). The base64 `data` is on the client
 * transcript even though the model-facing view elides it on stale turns
 * (retention is server-side).
 */
export function viewImageSrc(entry: ToolCallEntry): string | undefined {
  const out = asRecord("output" in entry ? entry.output : undefined);
  if (out.ok !== true) return undefined;
  const { mime, data } = out;
  if (
    typeof mime !== "string" ||
    typeof data !== "string" ||
    data.length === 0
  ) {
    return undefined;
  }
  return `data:${mime};base64,${data}`;
}

/** The refusal message for an error result (`ok: false`), if any. */
export function viewImageError(entry: ToolCallEntry): string | undefined {
  const out = asRecord("output" in entry ? entry.output : undefined);
  if (out.ok !== false) return undefined;
  return typeof out.message === "string" ? out.message : undefined;
}

/**
 * The whole `view_image` call body: the path, then the image below it. No JSON.
 * On an error result the path is shown with the refusal message instead of an
 * image; while the call is still running (no output yet) only the path shows.
 */
export function ViewImageContent({
  entry,
}: {
  entry: ToolCallEntry;
}): ReactNode {
  const path = viewImagePath(entry);
  const src = viewImageSrc(entry);
  const error = viewImageError(entry);
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
        // A base64 data: URL of agent-read bytes — `next/image` adds nothing
        // (no remote optimization, dynamic dims). Same as the user-image
        // `<img>` in `message.tsx`.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={path ?? "viewed image"}
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
