"use client";

import React, { useState, useMemo } from "react";
import { ChatBox } from "@/components/chat";
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
import { GenerationImageFrame } from "./_components/image-frame";
import { SlashIcon } from "@radix-ui/react-icons";
import {
  useImageModelConfig,
  useGenerateImage,
  useCredits,
} from "@/lib/ai/hooks";
import ai from "@/lib/ai";
import Link from "next/link";

export default function ImagePlayground() {
  const credits = useCredits();
  const [prompt, setPrompt] = useState("");
  const model = useImageModelConfig("gpt-image-1");
  const { generate, key, loading, image, start, end } = useGenerateImage();

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
        <div className="flex-1 flex flex-col items-center justify-center">
          {(loading || image) && (
            <GenerationImageFrame
              key={key}
              start={start}
              end={end}
              width={model.width}
              height={model.height}
              image={image}
              className="w-full overflow-scroll shadow-lg"
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
            placeholder="Describe what you want to see..."
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
