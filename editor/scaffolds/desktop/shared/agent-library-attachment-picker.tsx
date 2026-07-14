"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ImagesIcon, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import { ReferenceGallery } from "@/scaffolds/desktop/home/reference-gallery";
import type { DesignLibraryPin } from "./design-search";

export function AgentLibraryAttachmentPicker({
  open,
  onOpenChange,
  onAttach,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (pins: DesignLibraryPin[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<DesignLibraryPin[]>([]);
  const selectedIds = useMemo(
    () => new Set(picked.map((pin) => pin.id)),
    [picked]
  );

  const toggle = useCallback((pin: DesignLibraryPin) => {
    setPicked((current) =>
      current.some((item) => item.id === pin.id)
        ? current.filter((item) => item.id !== pin.id)
        : [...current, pin]
    );
  }, []);

  const setOpen = useCallback(
    (next: boolean) => {
      if (!next) setPicked([]);
      onOpenChange(next);
    },
    [onOpenChange]
  );

  const attach = useCallback(() => {
    if (picked.length === 0) return;
    onAttach(picked);
    setOpen(false);
  }, [onAttach, picked, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-testid="dialog-agent-library-attachment-picker"
        className="flex h-[min(800px,88vh)] w-[calc(100vw-2rem)] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
      >
        <DialogHeader className="shrink-0 px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ImagesIcon className="size-4" />
            Add from Library
          </DialogTitle>
          <DialogDescription>
            Choose raster references to include with your next message.
          </DialogDescription>
        </DialogHeader>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5">
          <ReferenceGallery
            onPick={toggle}
            selectedIds={selectedIds}
            scrollContainerRef={scrollRef}
            compact
            attachmentImagesOnly
          />
        </div>
        <div className="shrink-0 px-5 pb-4 pt-3">
          {picked.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {picked.map((pin) => (
                <div
                  key={pin.id}
                  className="group relative size-11 shrink-0 overflow-hidden rounded-md bg-muted shadow-sm"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pin.url}
                    alt={pin.title}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => toggle(pin)}
                    aria-label={`Remove ${pin.title}`}
                    className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/85 text-foreground opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100"
                  >
                    <XIcon className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={picked.length === 0}
              onClick={attach}
            >
              Add {picked.length > 0 ? picked.length : ""} reference
              {picked.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
