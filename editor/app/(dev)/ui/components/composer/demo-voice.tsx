"use client";

import type { ReactNode } from "react";
import { ComposerVoiceHostContext } from "@/scaffolds/desktop/shared/composer-dictation-controls";
import type { ComposerVoice } from "@/scaffolds/desktop/shared/composer-voice";

const SAMPLE_TRANSCRIPT = "Make the gallery handout easy to read at a glance.";

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
  async openMicrophone(_, signal) {
    signal.throwIfAborted();
    const context = new AudioContext();
    signal.addEventListener(
      "abort",
      () => void context.close().catch(() => {}),
      {
        once: true,
      }
    );
    const destination = context.createMediaStreamDestination();
    const sample = context.createBuffer(
      1,
      context.sampleRate * 2,
      context.sampleRate
    );
    const frames = sample.getChannelData(0);
    for (let i = 0; i < frames.length; i++) {
      const time = i / context.sampleRate;
      const envelope = Math.max(0, Math.sin(time * Math.PI * 7));
      frames[i] = Math.sin(time * Math.PI * 420) * envelope * 0.25;
    }
    const source = context.createBufferSource();
    source.buffer = sample;
    source.loop = true;
    source.connect(destination);
    source.start();
    void context.resume().catch(() => {});
    return destination.stream;
  },
  recognize(_, signal) {
    const { promise, resolve } = Promise.withResolvers<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => {
      clearTimeout(timer);
      resolve("");
    };
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
    return {
      result: promise,
      stop() {
        if (signal.aborted || timer) return;
        timer = setTimeout(() => {
          signal.removeEventListener("abort", cancel);
          resolve(SAMPLE_TRANSCRIPT);
        }, 350);
      },
    };
  },
};

export function ComposerDemoVoice({ children }: { children: ReactNode }) {
  return (
    <ComposerVoiceHostContext value={demoVoiceHost}>
      {children}
    </ComposerVoiceHostContext>
  );
}
