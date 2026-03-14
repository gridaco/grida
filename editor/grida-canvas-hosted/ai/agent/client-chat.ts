import { Chat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { CanvasDesignAgentMessage } from "./server-agent";
import { canvas_use } from "../tools/canvas-use";
import type { Editor } from "@/grida-canvas/editor";

export function makeEditorChat(editor: Editor) {
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
        case canvas_use.tools_spec.name_tree: {
          const input = toolCall.input as { entry_id?: string };
          const output = await canvas_use.client_impls.tree(editor, input);
          chat.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            ...output,
          });
          break;
        }
        case canvas_use.tools_spec.name_make_from_svg: {
          const input = toolCall.input as { svg: string };
          const output = await canvas_use.client_impls.make_from_svg(
            editor,
            input
          );

          chat.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            ...output,
          });
          break;
        }
        case canvas_use.tools_spec.name_make_from_image: {
          const input = toolCall.input as {
            name?: string;
            image_url?: string;
            width?: number;
            height?: number;
          };
          const output = await canvas_use.client_impls.make_from_image(
            editor,
            input
          );

          chat.addToolOutput({
            tool: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            ...output,
          });
          break;
        }
        case canvas_use.tools_spec.name_make_from_markdown: {
          const input = toolCall.input as { markdown: string };
          const output = await canvas_use.client_impls.make_from_markdown(
            editor,
            input
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
}
