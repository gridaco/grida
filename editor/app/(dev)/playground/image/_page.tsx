"use client";

import { ChatBox } from "@/components/chat";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { useCallback, useState } from "react";
import Image from "next/image";

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
      prompt,
      width,
      height,
    }: {
      prompt: string;
      width: number;
      height: number;
    }) => {
      setLoading(true);
      const r = await fetch(`/private/ai/generate/image`, {
        body: JSON.stringify({
          model: {
            provider: "replicate",
            modelId: "recraft-ai/recraft-v3",
          },
          width: width,
          height: height,
          prompt,
        }),
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

export default function ImagePlayground() {
  const [prompt, setPrompt] = useState("");
  const { generate, loading, image } = useGenerateImage();

  const onCommit = (value: { text: string }) => {
    setPrompt(value.text);
    generate({
      width: 1024,
      height: 1024,
      prompt: value.text,
    });
  };

  return (
    <main className="w-full min-h-screen h-screen overflow-hidden flex flex-col container max-w-xl mx-auto p-4">
      <div className="flex-1 w-full h-full">
        {(loading || image) && (
          <SingleImageFrame width={1024} height={1024} image={image} />
        )}
      </div>
      <div className="mt-4">
        <ChatBox
          disabled={loading}
          onValueCommit={onCommit}
          placeeholder="Describe what you want to see..."
        />
      </div>
    </main>
  );
}

function SingleImageFrame({
  image,
  className,
}: {
  image: {
    src: string;
    alt: string | null;
    width: number;
    height: number;
  } | null;
  width: number;
  height: number;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "relative w-full h-full overflow-hidden rounded",
        className
      )}
    >
      {image ? (
        <Image
          src={image.src}
          width={image.width}
          height={image.height}
          alt={image.alt ?? "Generated"}
          className="w-full h-full object-cover"
        />
      ) : (
        <Skeleton className="w-full h-full" />
      )}
    </figure>
  );
}
