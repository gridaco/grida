"use client";

import React, { useState } from "react";
import { Button } from "@app/ui/components/button";
import { PlayIcon } from "lucide-react";
import { sitemap } from "@/www/data/sitemap";

export default function EditorPreview() {
  const [isLocked, setIsLocked] = useState(true);

  return (
    <div className="relative w-full aspect-square md:aspect-video overflow-hidden">
      {isLocked && (
        <div
          className="absolute inset-0 from-background/80 to-background/20 bg-gradient-to-t z-20 flex flex-col items-center justify-center gap-3 cursor-pointer"
          onClick={() => setIsLocked(false)}
        >
          <Button size="lg" className="gap-2">
            <PlayIcon className="size-4" />
            Try it out
          </Button>
          <span className="text-xs text-muted-foreground">
            Interactive — click to unlock
          </span>
        </div>
      )}
      <div
        data-locked={isLocked}
        className="w-full h-full pointer-events-none data-[locked='false']:pointer-events-auto"
      >
        <iframe
          title="SVG editor preview"
          src={sitemap.links.svg_editor}
          className="w-full h-full"
          loading="lazy"
        />
      </div>
    </div>
  );
}
