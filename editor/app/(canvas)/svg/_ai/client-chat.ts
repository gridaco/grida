import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { AgentFs } from "@grida/agent/fs";
import { AgentTodos } from "@grida/agent/todos";
// Type-only import — erased at compile time, so this doesn't drag the server
// module (which depends on `next/headers`) into the client bundle.
import type { ModelTier } from "@/lib/ai/models";
import type { AgentMessage } from "./server-agent";

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
  const chat = new Chat<AgentMessage>({
    transport: new DefaultChatTransport<AgentMessage>({
      api: "/private/ai/design/chat",
      // `body` is a `Resolvable<object>` — a function form is read per request,
      // so a stale closure can't pin the tier to the value it had at chat
      // creation time.
      body: () => ({ tier: getTier() }),
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      // Try each fundamental resolver in order; first one to claim wins.
      const agentToolCall = {
        tool_name: toolCall.toolName,
        tool_call_id: toolCall.toolCallId,
        input: toolCall.input,
        dynamic: toolCall.dynamic,
      };
      const output =
        AgentFs.resolveToolCall(fs, agentToolCall) ??
        AgentTodos.resolveToolCall(todos, agentToolCall);
      // Unclaimed (no resolver returned a result) — not ours to answer. `== null`
      // covers both undefined (no resolver matched) and null (a resolver's
      // "miss"); the SDK's output type rejects null anyway.
      if (output == null) return;
      // The fs/todos resolvers dispatch on the tool name at runtime and return
      // that tool's output shape. `addToolResult` is statically keyed per tool
      // (`TOOL extends keyof tools`); bridge the dynamic resolver to it with one
      // cast rather than threading per-tool output unions through it.
      chat.addToolResult({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output,
      } as Parameters<typeof chat.addToolResult>[0]);
    },
  });

  return chat;
}

export type SvgEditorChat = ReturnType<typeof makeSvgEditorChat>;
