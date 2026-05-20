import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { SvgEditorAgentMessage } from "./server-agent";
import { AgentVFS } from "./agent-vfs";
import { TOOL_NAMES } from "./tools";

type UpdateFileInput = { content: string; version: number };

export function makeSvgEditorChat(vfs: AgentVFS) {
  const chat = new Chat<SvgEditorAgentMessage>({
    transport: new DefaultChatTransport<SvgEditorAgentMessage>({
      api: "/private/ai/svg/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: ({ toolCall }) => {
      if (toolCall.dynamic) return;
      const output = resolveToolCall(vfs, toolCall);
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

function resolveToolCall(
  vfs: AgentVFS,
  toolCall: { toolName: string; input: unknown }
): unknown {
  switch (toolCall.toolName) {
    case TOOL_NAMES.read_file:
      return vfs.read();
    case TOOL_NAMES.update_file: {
      const { content, version } = toolCall.input as UpdateFileInput;
      return vfs.write(content, version);
    }
    default:
      return undefined;
  }
}

export type SvgEditorChat = ReturnType<typeof makeSvgEditorChat>;
