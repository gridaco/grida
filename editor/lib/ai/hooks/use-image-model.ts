"use client";
import { useCallback, useState } from "react";
import { ai } from "../ai";

export function useImageModelConfig(defaultModel: ai.image.ImageModelId) {
  const [modelId, setModelId] = useState<ai.image.ImageModelId>(defaultModel);
  const [config, setConfig] = useState<{
    width: number;
    height: number;
  }>({
    width: 1024,
    height: 1024,
  });

  const [card, setCard] = useState<ai.image.ImageModelCard | undefined>(
    ai.image.models[defaultModel]
  );

  const select = useCallback((modelId: ai.image.ImageModelId) => {
    setCard(ai.image.models[modelId]);
    setModelId(modelId);
    // setConfig();
  }, []);

  const setSize = ({ width, height }: { width: number; height: number }) => {
    setConfig((c: any) => ({
      ...(c || {}),
      width: width,
      height: height,
    }));
  };

  const setSizeFromValue = (value: ai.image.SizeString) => {
    const [widthStr, heightStr] = value.split("x");
    const width = parseInt(widthStr);
    const height = parseInt(heightStr);
    setSize({ width, height });
  };

  return {
    modelId,
    card,
    ...config,
    models: Object.values(ai.image.models) as ai.image.ImageModelCard[],
    select,
    setSize,
    setSizeFromValue,
  };
}
