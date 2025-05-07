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
      aspect_ratio,
    }: {
      model: ai.image.ProviderModel | ai.image.ImageModelId;
      prompt: string;
      width?: number;
      height?: number;
      aspect_ratio?: ai.image.AspectRatioString;
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
            model,
            width,
            height,
            aspect_ratio,
            prompt,
          } satisfies GenerateImageApiRequestBody),
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      ).then((res) => res.json());
      const image = {
        src: r.data.publicUrl,
        width: r.data.width,
        height: r.data.height,
        alt: prompt,
      };

      setLoading(false);
      setEnd(new Date(r.data.timestamp));
      setImage(image);

      return image;
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
