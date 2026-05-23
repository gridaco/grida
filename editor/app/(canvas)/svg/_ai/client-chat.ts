import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { AgentFs } from "@grida/agent-tools/fs";
import { AgentTodos } from "@grida/agent-tools/todos";
// Type-only import — erased at compile time, so this doesn't drag the server
// module (which depends on `next/headers`) into the client bundle.
import type { ModelTier } from "@/lib/ai/models";
import type { SvgEditorAgentMessage } from "./server-agent";

/**
 * @param fs        Filesystem tool resolver for `read_file` / `update_file`.
 * @param todos     Todo list tool resolver.
 * @param getTier   Returns the user's currently selected tier. Read on every
 *                  outbound request (including auto-resends from
 *                  `sendAutomaticallyWhen`), so tier changes take effect on
 *                  the next turn without recreating the Chat instance.
 *                  The server validates and falls back to its default if the
 *                  value is missing or unknown.
 */
export function makeSvgEditorChat(
  fs: AgentFs,
  todos: AgentTodos,
  getTier: () => ModelTier
) {
  const chat = new Chat<SvgEditorAgentMessage>({
    transport: new DefaultChatTransport<SvgEditorAgentMessage>({
      api: "/private/ai/svg/chat",
      // `body` is a `Resolvable<object>` — a function form is read per request,
      // so a stale closure can't pin the tier to the value it had at chat
      // creation time.
      body: () => ({ tier: getTier() }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      // Try each fundamental resolver in order; first one to claim wins.
      const output =
        AgentFs.resolveToolCall(fs, toolCall) ??
        AgentTodos.resolveToolCall(todos, toolCall);
      if (output === undefined) return;
      chat.addToolResult({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
  });

  return chat;
}

export type SvgEditorChat = ReturnType<typeof makeSvgEditorChat>;
