"use client";
import { useCallback, useState } from "react";
import type { ai } from "../ai";
import type {
  GenerateImageApiRequestBody,
  GenerateImageApiResponse,
} from "@/app/(api)/private/ai/generate/image/route";

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
  alt: string | null;
};

export function useGenerateImage() {
  const [key, setKey] = useState(0);
  const [start, setStart] = useState<Date | null>(null);
  const [end, setEnd] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<GeneratedImage | null>(null);
  const generate = useCallback(
    async ({
      model,
      prompt,
      width,
      height,
    }: {
      model: ai.image.ProviderModel | ai.image.ImageModelId;
      prompt: string;
      width: number;
      height: number;
    }) => {
      setImage(null);
      setKey((k) => k + 1);
      setStart(new Date());
      setEnd(null);
      setLoading(true);
      const r: GenerateImageApiResponse = await fetch(
        `/private/ai/generate/image`,
        {
          body: JSON.stringify({
            model: model,
            width: width,
            height: height,
            prompt,
          } satisfies GenerateImageApiRequestBody),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      ).then((res) => res.json());
      setLoading(false);
      setEnd(new Date(r.data.timestamp));
      setImage({
        src: r.data.publicUrl,
        width: width,
        height: height,
        alt: prompt,
      });
    },
    []
  );

  return {
    key,
    loading,
    image,
    start,
    end,
    generate,
  };
}
