"use client";

import React, { useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { AgentInput } from "./components/agent-input";
import { UserMessage, AssistantMessage } from "./components/message-item";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { cn } from "@/components/lib/utils";
import { useCanvasChat } from "../agent/client-chat";

export function AgentPanel({ className }: { className?: string }) {
  const chat = useCanvasChat();

  const { messages, status, error, sendMessage, clearError } = useChat({
    chat,
  });

  const isLoading = status === "submitted" || status === "streaming";

  const handleSend = useCallback(
    async (content: string) => {
      clearError();
      await sendMessage({ text: content });
    },
    [clearError, sendMessage]
  );

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="flex-1 min-h-0">
        <Conversation className="relative h-full">
          <ConversationContent className="flex flex-col gap-4 py-4 px-6">
            {messages.length === 0 ? (
              <ConversationEmptyState title="" description="" />
            ) : (
              messages.map((uiMessage, index) => {
                const messageId = uiMessage.id ?? `${uiMessage.role}-${index}`;

                switch (uiMessage.role) {
                  case "assistant": {
                    const streamingIndicator =
                      isLoading && index === messages.length - 1;

                    return (
                      <AssistantMessage
                        key={messageId}
                        message={uiMessage}
                        isStreaming={streamingIndicator}
                      />
                    );
                  }
                  case "user":
                    return <UserMessage key={messageId} message={uiMessage} />;
                  default:
                    return null;
                }
              })
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
      {error && (
        <div className="px-4 py-2 text-sm text-destructive bg-destructive/10 border-t">
          {error.message}
        </div>
      )}
      <div className="p-4 pt-0">
        <AgentInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </div>
  );
}
