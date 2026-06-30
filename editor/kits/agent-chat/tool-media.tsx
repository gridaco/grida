/**
 * Per-tool OUTPUT rendering for the agent chat — the cases where a tool's
 * result is better shown as media than as the default JSON dump.
 *
 * Today that's `view_image`: its result carries the base64 image bytes, so we
 * render the actual image instead of pretty-printed JSON (which would otherwise
 * splat a multi-MB base64 string into the transcript). Kept OUT of the shared
 * `@app/ui` `ToolOutput` primitive — that stays tool-agnostic; the editor owns
 * the agent's tool vocabulary. `ToolOutput` renders a valid React element as-is,
 * so `ToolCallView` hands the element returned here straight through.
 */

import type { ReactNode } from "react";
import { getToolName } from "ai";
import { AgentVision } from "@grida/agent/vision";
import type { ToolCallEntry } from "@/lib/agent-chat";

/**
 * The image element for an image-bearing tool result, or `null` to fall back to
 * the default JSON view. The bytes are the result's base64 `data` — present on
 * the client transcript even though the model-facing view elides it on stale
 * turns (retention, server-side). Matches the user-pasted-image `<img>` look so
 * every image in the chat shares one style.
 */
export function toolOutputMedia(entry: ToolCallEntry): ReactNode | null {
  if (getToolName(entry) !== AgentVision.TOOL_NAMES.view_image) return null;
  const output = "output" in entry ? entry.output : undefined;
  if (!output || typeof output !== "object") return null;
  const { ok, mime, data } = output as {
    ok?: boolean;
    mime?: unknown;
    data?: unknown;
  };
  if (ok !== true || typeof mime !== "string" || typeof data !== "string") {
    return null;
  }
  if (data.length === 0) return null;
  return (
    // A base64 data: URL of agent-produced bytes — `next/image` adds nothing
    // here (no remote optimization, dynamic dims). Matches the user-image
    // `<img>` in `message.tsx`, which disables the same rule for the same reason.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`data:${mime};base64,${data}`}
      alt="viewed image"
      loading="lazy"
      decoding="async"
      className="max-h-96 max-w-full rounded-md border object-contain"
    />
  );
}
