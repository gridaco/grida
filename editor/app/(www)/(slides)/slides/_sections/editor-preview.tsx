"use client";

import React, { useState } from "react";
import { motion } from "motion/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PlayIcon } from "lucide-react";

export default function EditorPreview() {
  const [isLocked, setIsLocked] = useState(true);

  return (
    <div className="flex flex-col items-center gap-6">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
        className="w-full"
      >
        <Card className="mx-auto p-0 max-w-screen-lg 2xl:max-w-screen-2xl aspect-square md:aspect-video overflow-hidden relative">
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
              title="Slides editor preview"
              src="/canvas/slides"
              className="w-full h-full"
              loading="lazy"
            />
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
