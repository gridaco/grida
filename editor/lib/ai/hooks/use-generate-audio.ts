"use client";
import { useCallback, useState } from "react";
import type { ai } from "../ai";
import type {
  GenerateAudioApiRequestBody,
  GenerateAudioApiResponse,
} from "@/app/(api)/private/ai/audio/generate/route";

type GeneratedAudio = {
  url: string;
  modelId: ai.audio.AudioModelId;
  prompt: string;
};

export function useGenerateAudio() {
  const [key, setKey] = useState(0);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<GeneratedAudio | null>(null);

  const generate = useCallback(
    async (input: {
      model: ai.audio.AudioModelId;
      prompt: string;
      image_inputs?: string[];
      language?: string;
      negative_prompt?: string;
      seed?: number;
    }): Promise<GeneratedAudio | null> => {
      setAudio(null);
      setError(null);
      setKey((k) => k + 1);
      setStart(new Date());
      setEnd(null);
      setLoading(true);

      try {
        const res = await fetch(`/private/ai/audio/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input satisfies GenerateAudioApiRequestBody),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setError(data.message ?? "something went wrong");
          return null;
        }

        const r = (await res.json()) as GenerateAudioApiResponse;
        const next: GeneratedAudio = {
          url: r.data.url,
          modelId: r.data.modelId,
          prompt: input.prompt,
        };
        setEnd(new Date(r.data.timestamp));
        setAudio(next);
        return next;
      } catch (e) {
        setError(String(e));
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    key,
    loading,
    audio,
    error,
    start,
    end,
    generate,
  };
}
