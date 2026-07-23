import { isTextUIPart, isToolUIPart } from "ai";
import type { ChatMessage, ToolCallEntry } from "@/lib/agent-chat";

/**
 * One contiguous render unit walked out of a message's `parts`.
 * Consecutive tool calls collapse into one group; reasoning and other part
 * kinds the renderer doesn't handle (file / source / step markers) are
 * dropped. Reasoning tokens remain transport/session data, but they are not
 * user-facing transcript content.
 *
 * Note on `file` parts: user-message images render inline via a dedicated
 * branch in `message.tsx` (perceive-only attachments), NOT through this
 * grouping. Assistant `file` parts are intentionally dropped here — the agent
 * produces none in the current scope. If assistant-emitted files ever need
 * rendering, promote `file` to a first-class `RenderGroup` rather than adding
 * another ad-hoc branch.
 */
export type RenderGroup =
  | { type: "text"; key: string; text: string }
  | { type: "tools"; key: string; entries: ToolCallEntry[] };

export function groupMessageParts(message: ChatMessage): RenderGroup[] {
  const groups: RenderGroup[] = [];

  for (const [index, part] of message.parts.entries()) {
    if (isTextUIPart(part)) {
      groups.push({ type: "text", key: `text-${index}`, text: part.text });
      continue;
    }

    if (!isToolUIPart(part)) continue;
    const entry = part;

    const last = groups[groups.length - 1];
    if (last?.type === "tools") {
      last.entries.push(entry);
    } else {
      groups.push({
        type: "tools",
        key: `tools-${index}`,
        entries: [entry],
      });
    }
  }

  return groups;
}
