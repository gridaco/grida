"use client";
import { useCallback, useState } from "react";
import { ai } from "../ai";

const _default_size = {
  width: 1024,
  height: 1024,
  aspect_ratio: "1:1" as ai.image.AspectRatioString,
};

export function useImageModelConfig(defaultModel: ai.image.ImageModelId) {
  const [modelId, setModelId] = useState<ai.image.ImageModelId>(defaultModel);
  const [config, setConfig] = useState<{
    width?: number;
    height?: number;
    aspect_ratio?: ai.image.AspectRatioString;
  }>(_default_size);

  const [card, setCard] = useState<ai.image.ImageModelCard | undefined>(
    ai.image.models[defaultModel]
  );

  const select = useCallback((modelId: ai.image.ImageModelId) => {
    const card = ai.image.models[modelId];
    setCard(card);
    setModelId(modelId);
    setConfig(card?.default ?? _default_size);
  }, []);

  const setSize = (
    size:
      | ai.image.SizeString
      | ai.image.AspectRatioString
      | { width: number; height: number }
      | {
          aspect_ratio: string;
        }
  ) => {
    if (!card) return;

    let _width: number | null = null;
    let _height: number | null = null;
    let _aspect_ratio: ai.image.AspectRatioString | null = null;

    let width: number | null = null;
    let height: number | null = null;
    let aspect_ratio: ai.image.AspectRatioString | null = null;

    // parse size
    if (typeof size === "string") {
      if (size.includes("x")) {
        const [widthStr, heightStr] = size.split("x");
        _width = parseInt(widthStr);
        _height = parseInt(heightStr);
      } else if (size.includes(":")) {
        _aspect_ratio = size as ai.image.AspectRatioString;
      }
    } else if (typeof size === "object") {
      if ("width" in size && "height" in size) {
        _width = size.width;
        _height = size.height;
      } else if ("aspect_ratio" in size) {
        _aspect_ratio = size.aspect_ratio as ai.image.AspectRatioString;
      }
    }

    // validate size
    if (card.sizes) {
      const _size = card.sizes?.find(([w, h, r]) => {
        return (w === _width && h === _height) || r === _aspect_ratio;
      });

      if (_size) {
        const [w, h, r] = _size;
        width = w;
        height = h;
        aspect_ratio = r;
      }
    }

    setConfig((c: any) => ({
      ...(c || {}),
      width: width,
      height: height,
      aspect_ratio: aspect_ratio,
    }));
  };

  return {
    modelId,
    card,
    width: config.width,
    height: config.height,
    aspect_ratio: config.aspect_ratio,
    models: Object.values(ai.image.models) as ai.image.ImageModelCard[],
    select,
    setSize,
  };
}
