"use client";

import type { ReactNode } from "react";
import { ComposerVoiceHostContext } from "@/scaffolds/desktop/shared/composer-dictation-controls";
import type { ComposerVoice } from "@/scaffolds/desktop/shared/composer-voice";
import { recognizeDemoSpeech } from "./demo-speech-recognition";

export const demoVoiceHost: ComposerVoice.Host = {
  isSupported: () => true,
  getSettings: async () => ({
    provider: "openai",
    useApiKey: true,
    microphoneId: "default",
    language: "auto",
    dictionary: [],
  }),
  subscribe: () => () => {},
  recognize: recognizeDemoSpeech,
};

export function ComposerDemoVoice({ children }: { children: ReactNode }) {
  return (
    <ComposerVoiceHostContext value={demoVoiceHost}>
      {children}
    </ComposerVoiceHostContext>
  );
}
