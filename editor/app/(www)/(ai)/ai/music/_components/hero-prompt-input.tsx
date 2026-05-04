"use client";

import React, { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

const PLAYGROUND_HREF = "/ai/music/playground";

export function HeroPromptInput() {
  const router = useRouter();

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text?.trim();
      if (!text) return;
      const url = `${PLAYGROUND_HREF}?prompt=${encodeURIComponent(text)}`;
      router.push(url);
    },
    [router]
  );

  return (
    <div className="mx-auto max-w-2xl text-left">
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputBody>
          <PromptInputTextarea
            placeholder="Lo-fi piano, mellow, 75 BPM, raining outside…"
            className="min-h-[88px] text-base"
          />
        </PromptInputBody>
        <PromptInputFooter>
          <PromptInputTools />
          <PromptInputSubmit className="px-3" />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
