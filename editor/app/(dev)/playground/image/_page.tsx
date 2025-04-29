"use client";

import { ChatBox } from "@/components/chat";

import { useCallback, useEffect, useState, useMemo } from "react";
import { CommandIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select";
import { GridaLogo } from "@/components/grida-logo";
import ai from "@/lib/ai";
import Link from "next/link";
import { SingleImageFrame } from "./_components/image-frame";
import { SlashIcon } from "@radix-ui/react-icons";
import type { GenerateImageApiRequestBody } from "@/app/(api)/private/ai/generate/image/route";

type GeneratedImage = {
  src: string;
  width: number;
  height: number;
  alt: string | null;
};

function useGenerateImage() {
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
      setLoading(true);
      const r = await fetch(`/private/ai/generate/image`, {
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
      }).then((res) => res.json());
      setLoading(false);
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
    loading,
    image,
    generate,
  };
}

function useCredits() {
  const [remaining, setRemaining] = useState(0);
  const [reset, setReset] = useState(0);

  const refresh = useCallback(async () => {
    const r = await fetch(`/private/ai/credits`, {
      method: "GET",
    }).then((res) => res.json());
    setRemaining(r.data.remaining);
    setReset(r.data.reset);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    remaining,
    reset,
    refresh,
  };
}

function useImageModelConfig(defaultModel: ai.image.ImageModelId) {
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

export default function ImagePlayground() {
  const credits = useCredits();
  const [prompt, setPrompt] = useState("");
  const model = useImageModelConfig("gpt-image-1");
  const { generate, loading, image } = useGenerateImage();

  const sizeGroups = useMemo(() => {
    const groups = {
      square: [] as ai.image.SizeWithAspectRatio[],
      horizontal: [] as ai.image.SizeWithAspectRatio[],
      vertical: [] as ai.image.SizeWithAspectRatio[],
    };
    (model.card?.sizes ?? []).forEach((s) => {
      const [w, h, r] = s;
      const key = w === h ? "square" : w > h ? "horizontal" : "vertical";
      groups[key].push(s);
    });
    return groups;
  }, [model.card]);

  const onCommit = (value: { text: string }) => {
    setPrompt(value.text);
    generate({
      model: model.modelId,
      width: model.width,
      height: model.height,
      prompt: value.text,
    }).finally(() => {
      credits.refresh();
    });
  };

  return (
    <div className="relative w-full min-h-screen h-screen overflow-hidden">
      <header className="absolute left-4 top-4 flex items-center gap-1">
        <Link href="/home">
          <GridaLogo />
        </Link>
        <SlashIcon className="size-5" />
        <span className="text-sm font-bold">Image Playground</span>
      </header>
      <main className="w-full h-full flex flex-col container max-w-xl mx-auto p-4">
        <div className="flex-1 w-full h-full">
          {(loading || image) && (
            <SingleImageFrame
              key={prompt}
              width={model.width}
              height={model.height}
              image={image}
            />
          )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 rounded-lg p-1 border">
            <Select
              value={`${model.width}x${model.height}`}
              onValueChange={model.setSizeFromValue}
            >
              <SelectTrigger className="w-min border-none">
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent>
                {sizeGroups.square.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Square</SelectLabel>
                    {sizeGroups.square.map(([w, h, r]) => (
                      <SelectItem key={r} value={`${w}x${h}`}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {sizeGroups.horizontal.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Horizontal</SelectLabel>
                    {sizeGroups.horizontal.map(([w, h, r]) => (
                      <SelectItem key={r} value={`${w}x${h}`}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {sizeGroups.vertical.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Vertical</SelectLabel>
                    {sizeGroups.vertical.map(([w, h, r]) => (
                      <SelectItem key={r} value={`${w}x${h}`}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
            <Select
              value={model.modelId}
              onValueChange={(v) => model.select(v as ai.image.ImageModelId)}
            >
              <SelectTrigger className="w-min border-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {model.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ChatBox
            disabled={loading}
            onValueCommit={onCommit}
            placeeholder="Describe what you want to see..."
          />
        </div>
      </main>
      <div className="absolute top-4 right-4">
        <Tooltip>
          <TooltipTrigger>
            <div className="px-2 py-1 bg-muted rounded-md border flex gap-1 items-center">
              <CommandIcon className="size-3" />
              <span className="text-sm font-mono">
                {credits.remaining?.toString()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" align="start">
            <div className="text-sm font-mono">
              {credits.remaining?.toString()} free credits remaining
            </div>
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
