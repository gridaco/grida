"use client";

import { useId, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@app/ui/components/dialog";
import { cn } from "@app/ui/lib/utils";
import { Transparency } from "@/grida-canvas-react/components/transparency";

/** Keep the image and prompt within one viewport budget.
 * (see test/desktop-media-image-preview-long-prompt.md) */
export function GeneratedImagePreview({
  open,
  onOpenChange,
  src,
  prompt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src?: string;
  prompt: string;
}) {
  const promptId = useId();
  const [expanded, setExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle"
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="dialog-generated-image-preview"
        aria-describedby={undefined}
        className="h-[90dvh] max-h-[56rem] w-[90vw] max-w-[90vw] grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogTitle className="sr-only">Generated image</DialogTitle>
        <Transparency className="min-h-0 min-w-0 overflow-hidden">
          {src && (
            // eslint-disable-next-line @next/next/no-img-element -- Generated data URLs do not use Next.js image optimization.
            <img
              src={src}
              alt="Generated image"
              className="h-full w-full object-contain"
            />
          )}
        </Transparency>
        <div className="min-w-0 space-y-2 border-t p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-controls={promptId}
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Show less" : "Show full prompt"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={copyPrompt}
            >
              {copyStatus === "copied" ? <Check /> : <Copy />}
              <span aria-live="polite">
                {copyStatus === "copied"
                  ? "Copied"
                  : copyStatus === "error"
                    ? "Retry copy"
                    : "Copy prompt"}
              </span>
            </Button>
          </div>
          <p
            id={promptId}
            role="region"
            tabIndex={expanded ? 0 : undefined}
            aria-label="Image prompt"
            className={cn(
              "text-sm whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]",
              expanded
                ? "max-h-[min(12rem,25dvh)] overflow-y-auto overscroll-contain"
                : "line-clamp-3"
            )}
          >
            {prompt}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
