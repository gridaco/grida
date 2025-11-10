"use client";

import { useMemo } from "react";
import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { CanvasDesignAgentMessage } from "./server-agent";
import { useCurrentEditor } from "@/grida-canvas-react";
import { canvas_use } from "../tools/canvas-use";

export function useCanvasChat() {
  const editor = useCurrentEditor();
  return useMemo(() => {
    const chat = new Chat<CanvasDesignAgentMessage>({
      transport: new DefaultChatTransport<CanvasDesignAgentMessage>({
        api: "/private/ai/chat",
      }),
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: async ({ toolCall }) => {
        if (toolCall.dynamic) {
          return;
        }

        switch (toolCall.toolName) {
          case "canvas_use_create_node_from_svg": {
            const output = await canvas_use.client_impls.create_node_from_svg(
              editor,
              toolCall.input
            );

            chat.addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              ...output,
            });
            break;
          }
          case "canvas_use_create_node_from_image": {
            const output = await canvas_use.client_impls.create_node_from_image(
              editor,
              toolCall.input
            );

            chat.addToolOutput({
              tool: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              ...output,
            });
            break;
          }
          // case "canvas_use.create_node": {
          //   // editor.commands.createNodeFromSvg
          // }
        }
      },
    });

    return chat;
  }, [editor]);
}
