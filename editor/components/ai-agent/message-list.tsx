"use client";

import React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "./message-item";
import type { Message } from "@/lib/ai-agent/types";

export interface MessageListProps {
  messages: Message[];
  className?: string;
}

export function MessageList({ messages, className }: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center text-muted-foreground">
        <div>
          <p className="text-sm font-medium mb-2">AI Assistant</p>
          <p className="text-xs">
            Ask me to create images, add text, or generate UI components.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={className}>
      <div className="flex flex-col">
        {messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))}
      </div>
    </ScrollArea>
  );
}
