"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SendIcon, PlusIcon } from "lucide-react";
import { ContextBadge } from "./context-badge";
import type { SelectionContext } from "@/lib/ai-agent/types";
import { cn } from "@/components/lib/utils";

export interface AgentInputProps {
  onSend: (content: string, context?: SelectionContext | null) => Promise<void>;
  context?: SelectionContext | null;
  onIncludeContext?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AgentInput({
  onSend,
  context,
  onIncludeContext,
  isLoading = false,
  disabled = false,
  placeholder = "Ask me to create images, add text, or generate UI...",
  className,
}: AgentInputProps) {
  const [input, setInput] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || disabled) return;

    const content = input.trim();
    setInput("");
    await onSend(content, context);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={cn("flex flex-col gap-2 border-t p-4 bg-background", className)}>
      {context && (
        <ContextBadge context={context} className="mb-2" />
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            className="min-h-[60px] resize-none pr-10"
            rows={2}
          />
          {onIncludeContext && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onIncludeContext}
              disabled={disabled || isLoading}
              className={cn(
                "absolute right-2 top-2 size-6",
                context && "bg-primary text-primary-foreground"
              )}
              title="Include selection context"
            >
              <PlusIcon className="size-4" />
            </Button>
          )}
        </div>
        <Button
          type="submit"
          disabled={!input.trim() || isLoading || disabled}
          size="icon"
        >
          <SendIcon className="size-4" />
        </Button>
      </form>
    </div>
  );
}
