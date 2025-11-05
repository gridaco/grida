"use client";

import React from "react";
import { cn } from "@/components/lib/utils";
import type { Message } from "@/lib/ai-agent/types";
import { BotIcon, UserIcon } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export interface MessageItemProps {
  message: Message;
  className?: string;
}

export function MessageItem({ message, className }: MessageItemProps) {
  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  return (
    <div
      className={cn(
        "flex gap-3 p-4",
        isUser && "bg-muted/50",
        isAssistant && "bg-background",
        className
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser && "bg-primary text-primary-foreground",
          isAssistant && "bg-secondary text-secondary-foreground"
        )}
      >
        {isUser ? (
          <UserIcon className="size-4" />
        ) : (
          <BotIcon className="size-4" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="text-sm font-medium">
          {isUser ? "You" : "Assistant"}
        </div>
        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
          {message.content || (isAssistant && <Spinner className="size-4" />)}
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.toolCalls.map((toolCall) => (
              <div
                key={toolCall.id}
                className="text-xs text-muted-foreground bg-muted/50 rounded p-2"
              >
                <span className="font-medium">{toolCall.name}</span>
                {message.toolResults?.find(
                  (r) => r.toolCallId === toolCall.id
                ) && (
                  <span className="ml-2 text-green-600 dark:text-green-400">
                    ✓ Executed
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
