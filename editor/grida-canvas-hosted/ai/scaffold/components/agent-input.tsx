"use client";

import React, { useRef } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputProvider,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextCacheUsage,
  ContextTrigger,
} from "@/components/ai-elements/context";
import type { ChatStatus, LanguageModelUsage } from "ai";
import { ArrowUpIcon, XIcon } from "lucide-react";
import { InputGroupButton } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

export type ContextUsageData = {
  usedTokens: number;
  maxTokens: number;
  usage: LanguageModelUsage;
  modelId: string | undefined;
};

export interface AgentInputProps {
  onSend: (content: string) => Promise<void>;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  contextUsage?: ContextUsageData;
}

export function AgentInput({
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = "Ask anything",
  autoFocus = true,
  contextUsage,
}: AgentInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const status = isLoading ? "streaming" : "ready";

  const handleSubmit = async (message: PromptInputMessage) => {
    const hasText = Boolean(message.text?.trim());
    if (!hasText || disabled) return;

    void onSend(message.text!).catch((error) => {
      console.error("Agent input submission failed", error);
    });
  };

  return (
    <PromptInputProvider>
      <PromptInput onSubmit={handleSubmit} className="bg-accent">
        <PromptInputBody>
          <PromptInputTextarea
            ref={textareaRef}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[60px]"
            autoFocus={autoFocus}
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools>
            {contextUsage && contextUsage.usedTokens > 0 && (
              <ContextIndicator {...contextUsage} />
            )}
          </PromptInputTools>
          <PromptInputSubmit status={status} disabled={disabled} />
        </PromptInputFooter>
      </PromptInput>
    </PromptInputProvider>
  );
}

// ---------------------------------------------------------------------------
// Context window indicator
// ---------------------------------------------------------------------------

function ContextIndicator({
  usedTokens,
  maxTokens,
  usage,
  modelId,
}: ContextUsageData) {
  return (
    <Context
      usedTokens={usedTokens}
      maxTokens={maxTokens || 1}
      usage={usage}
      modelId={modelId}
    >
      <ContextTrigger className="h-6 px-1.5 text-xs" />
      <ContextContent side="top" align="start">
        <ContextContentHeader />
        <ContextContentBody>
          <div className="space-y-1">
            <ContextInputUsage />
            <ContextOutputUsage />
            <ContextReasoningUsage />
            <ContextCacheUsage />
          </div>
        </ContextContentBody>
        <ContextContentFooter />
      </ContextContent>
    </Context>
  );
}

// ---------------------------------------------------------------------------
// Submit button
// ---------------------------------------------------------------------------

const PromptInputSubmit = ({
  status,
  ...props
}: React.ComponentProps<"button"> & { status: ChatStatus }) => {
  let Icon = <ArrowUpIcon className="size-3.5" />;

  if (status === "submitted") {
    Icon = <Spinner className="size-3.5" />;
  } else if (status === "streaming") {
    Icon = <SquareFilledIcon className="size-3.5" />;
  } else if (status === "error") {
    Icon = <XIcon className="size-3.5" />;
  }

  return (
    <InputGroupButton
      aria-label="Submit"
      size="icon-xs"
      type="submit"
      variant="default"
      className="rounded-full"
      {...props}
    >
      {Icon}
    </InputGroupButton>
  );
};

function SquareFilledIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <rect x="4" y="4" width="16" height="16" rx="4" ry="4" />
    </svg>
  );
}
