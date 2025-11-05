"use client";

import { useCallback, useState, useRef, useEffect } from "react";
import { useSyncExternalStore } from "react";
import { ChatManager } from "../chat";
import type { Message, SelectionContext } from "../types";
import type { editor } from "@/grida-canvas";

export interface UseAgentChatOptions {
  editor: editor.Editor | null;
}

export interface UseAgentChatReturn {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (
    content: string,
    context?: SelectionContext | null
  ) => Promise<void>;
  clear: () => void;
}

export function useAgentChat({
  editor,
}: UseAgentChatOptions): UseAgentChatReturn {
  const [chatManager] = useState(() => new ChatManager());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const messages = useSyncExternalStore(
    (listener) => chatManager.subscribe(listener),
    () => chatManager.getMessages()
  );

  const sendMessage = useCallback(
    async (content: string, context?: SelectionContext | null) => {
      if (!editor) {
        setError("Editor not available");
        return;
      }

      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      abortControllerRef.current = new AbortController();
      setIsLoading(true);
      setError(null);

      // Add user message
      const userMessage = chatManager.addMessage({
        role: "user",
        content,
      });

      try {
        // Prepare request body
        const body: {
          messages: Array<{
            role: "user" | "assistant" | "system";
            content: string;
          }>;
          context?: SelectionContext;
        } = {
          messages: [
            ...messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
            {
              role: "user",
              content,
            },
          ],
        };

        if (context) {
          body.context = context;
        }

        // Add assistant message for streaming
        const assistantMessage = chatManager.addMessage({
          role: "assistant",
          content: "",
        });

        // Stream response
        const response = await fetch("/private/ai/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || "Failed to send message");
        }

        if (!response.body) {
          throw new Error("No response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        let accumulatedContent = "";
        let currentToolCalls: ToolCall[] = [];
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.trim()) continue;

            // AI SDK data stream format: prefix:JSON
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) continue;

            const prefix = line.slice(0, colonIndex);
            const data = line.slice(colonIndex + 1);

            try {
              switch (prefix) {
                case "0": {
                  // Text delta
                  const parsed = JSON.parse(data);
                  if (parsed.type === "text-delta" && parsed.textDelta) {
                    accumulatedContent += parsed.textDelta;
                    chatManager.updateMessage(assistantMessage.id, {
                      content: accumulatedContent,
                    });
                  }
                  break;
                }
                case "1": {
                  // Tool call
                  const parsed = JSON.parse(data);
                  if (parsed.type === "tool-call") {
                    const toolCall: ToolCall = {
                      id: parsed.toolCallId || `tool-${Date.now()}`,
                      name: parsed.toolName || "",
                      arguments: parsed.args || {},
                    };
                    currentToolCalls.push(toolCall);
                    chatManager.addToolCall(assistantMessage.id, toolCall);
                  }
                  break;
                }
                case "2": {
                  // Tool result
                  const parsed = JSON.parse(data);
                  if (parsed.type === "tool-result") {
                    const toolResult: ToolResult = {
                      toolCallId: parsed.toolCallId || "",
                      result: parsed.result,
                      error: parsed.error,
                    };
                    chatManager.addToolResult(assistantMessage.id, toolResult);
                    
                    // Execute the tool when we receive the result
                    const toolCall = currentToolCalls.find(tc => tc.id === toolResult.toolCallId);
                    if (toolCall && editor) {
                      executeToolCall(editor, toolCall, toolResult, assistantMessage.id, chatManager).catch(err => {
                        console.error("Error executing tool:", err);
                      });
                    }
                  }
                  break;
                }
                case "d": {
                  // Data - could be tool call or result
                  const parsed = JSON.parse(data);
                  if (parsed.type === "tool-call") {
                    const toolCall: ToolCall = {
                      id: parsed.toolCallId || `tool-${Date.now()}`,
                      name: parsed.toolName || "",
                      arguments: parsed.args || {},
                    };
                    currentToolCalls.push(toolCall);
                    chatManager.addToolCall(assistantMessage.id, toolCall);
                  } else if (parsed.type === "tool-result") {
                    const toolResult: ToolResult = {
                      toolCallId: parsed.toolCallId || "",
                      result: parsed.result,
                      error: parsed.error,
                    };
                    chatManager.addToolResult(assistantMessage.id, toolResult);
                    
                    // Execute the tool when we receive the result
                    const toolCall = currentToolCalls.find(tc => tc.id === toolResult.toolCallId);
                    if (toolCall && editor) {
                      executeToolCall(editor, toolCall, toolResult, assistantMessage.id, chatManager).catch(err => {
                        console.error("Error executing tool:", err);
                      });
                    }
                  } else if (parsed.type === "text-delta" && parsed.textDelta) {
                    accumulatedContent += parsed.textDelta;
                    chatManager.updateMessage(assistantMessage.id, {
                      content: accumulatedContent,
                    });
                  }
                  break;
                }
              }
            } catch (e) {
              // Try to parse as plain text content if JSON parsing fails
              if (prefix === "0" || prefix === "d") {
                accumulatedContent += data;
                chatManager.updateMessage(assistantMessage.id, {
                  content: accumulatedContent,
                });
              }
            }
          }
        }

        // Tool execution happens when tool results are received
        // (handled in the streaming loop above)
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Request was cancelled, ignore
          return;
        }
        console.error("Error sending message:", err);
        setError(err.message || "Failed to send message");
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [editor, messages, chatManager]
  );

  const clear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    chatManager.clear();
    setError(null);
    setIsLoading(false);
  }, [chatManager]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clear,
  };
}

// Helper types
interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

// Execute a single tool call with its result
async function executeToolCall(
  editor: editor.Editor,
  toolCall: ToolCall,
  toolResult: ToolResult,
  messageId: string,
  chatManager: ChatManager
): Promise<void> {
  try {
    let executionResult: unknown;

    switch (toolCall.name) {
        case "create_image": {
          if (toolResult.result && typeof toolResult.result === 'object') {
            const imageData = toolResult.result as {
              action: string;
              imageUrl: string;
              width: number;
              height: number;
              prompt: string;
            };
            
            // Insert image node
            const nodeId = editor.commands.insertNode({
              type: "image",
              name: imageData.prompt,
              width: imageData.width,
              height: imageData.height,
              fit: "cover",
            });

            // Update src
            editor.commands.changeNodePropertySrc(nodeId, imageData.imageUrl);

            executionResult = { nodeId, imageUrl: imageData.imageUrl };
          } else {
            throw new Error("Invalid image data from tool result");
          }
          break;
        }

        case "create_text": {
          const params = (toolResult.result && typeof toolResult.result === 'object' 
            ? toolResult.result 
            : toolCall.arguments) as {
            action?: string;
            text: string;
            node_id?: string;
            x?: number;
            y?: number;
          };

          if (params.node_id) {
            // Update existing text node
            editor.commands.changeNodePropertyText(params.node_id, params.text);
            executionResult = { nodeId: params.node_id, updated: true };
          } else {
            // Create new text node
            const nodeId = editor.commands.insertNode({
              type: "text",
              text: params.text,
              x: params.x,
              y: params.y,
            });
            executionResult = { nodeId, created: true };
          }
          break;
        }

        case "create_ui_components": {
          const resultData = (toolResult.result && typeof toolResult.result === 'object' 
            ? toolResult.result 
            : { nodes: toolCall.arguments.nodes }) as {
            action?: string;
            nodes: Array<{
              type: string;
              x?: number;
              y?: number;
              width?: number;
              height?: number;
              text?: string;
              src?: string;
              children?: any[];
            }>;
          };

          const createdNodeIds: string[] = [];

          // Recursively insert nodes
          const insertNodeRecursive = (
            nodeSpec: typeof resultData.nodes[0],
            parentId?: string
          ): string => {
            const nodePrototype: any = {
              type: nodeSpec.type,
            };

            if (nodeSpec.x !== undefined) nodePrototype.x = nodeSpec.x;
            if (nodeSpec.y !== undefined) nodePrototype.y = nodeSpec.y;
            if (nodeSpec.width !== undefined) nodePrototype.width = nodeSpec.width;
            if (nodeSpec.height !== undefined) nodePrototype.height = nodeSpec.height;

            if (nodeSpec.type === "text" && nodeSpec.text) {
              nodePrototype.text = nodeSpec.text;
            }

            if (nodeSpec.type === "image" && nodeSpec.src) {
              nodePrototype.src = nodeSpec.src;
            }

            const nodeId = editor.commands.insertNode(nodePrototype);
            createdNodeIds.push(nodeId);

            // Handle children if this is a container
            if (
              nodeSpec.type === "container" &&
              nodeSpec.children &&
              Array.isArray(nodeSpec.children)
            ) {
              for (const child of nodeSpec.children) {
                insertNodeRecursive(child, nodeId);
              }
            }

            return nodeId;
          };

          for (const nodeSpec of resultData.nodes) {
            insertNodeRecursive(nodeSpec);
          }

          executionResult = { nodeIds: createdNodeIds, count: createdNodeIds.length };
          break;
        }

        default:
          throw new Error(`Unknown tool: ${toolCall.name}`);
      }

      // Tool was already executed on server, just log the client-side execution result
      console.log("Tool executed:", toolCall.name, executionResult);
    } catch (err: any) {
      console.error("Error executing tool:", toolCall.name, err);
      // Update tool result with error
      chatManager.addToolResult(messageId, {
        toolCallId: toolCall.id,
        result: toolResult.result,
        error: err.message || "Tool execution failed",
      });
    }
  }
