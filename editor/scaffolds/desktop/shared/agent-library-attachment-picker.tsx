"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ImagesIcon, XIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import { ReferenceGallery } from "@/scaffolds/desktop/home/reference-gallery";
import {
  LibraryExplorerView,
  type LibraryExplorerItem,
} from "@/kits/library-explorer";
import { isSupportedImageType } from "@/lib/agent-chat/image-attachment";
import {
  resolveLibraryExplorerPage,
  type DesignLibraryPin,
} from "./design-search";

export function AgentLibraryAttachmentPicker({
  open,
  onOpenChange,
  onAttach,
  single = false,
  request,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAttach: (pins: DesignLibraryPin[]) => void;
  single?: boolean;
  request?: {
    initialQuery: string;
    busy: boolean;
    error: string | null;
    skip: () => void;
    retry?: () => void;
  };
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<DesignLibraryPin[]>([]);
  const [query, setQuery] = useState(request?.initialQuery ?? "");
  const [draftQuery, setDraftQuery] = useState(query);
  const searchSource = useMemo(
    () => ({ kind: "search", query }) as const,
    [query]
  );
  const busy = request?.busy === true;
  const fixed = busy || !!request?.retry;
  const selectedIds = useMemo(
    () => new Set(picked.map((pin) => pin.id)),
    [picked]
  );

  const toggle = useCallback(
    (pin: DesignLibraryPin) => {
      setPicked((current) => {
        if (current.some((item) => item.id === pin.id))
          return current.filter((item) => item.id !== pin.id);
        return single ? [pin] : [...current, pin];
      });
    },
    [single]
  );
  const toggleSearchResult = useCallback(
    (pin: LibraryExplorerItem) => {
      if (!fixed && isSupportedImageType(pin.mime))
        toggle({ ...pin, mime: pin.mime });
    },
    [fixed, toggle]
  );

  const setOpen = useCallback(
    (next: boolean) => {
      if (busy) return;
      if (!next) setPicked([]);
      onOpenChange(next);
    },
    [busy, onOpenChange]
  );

  const attach = useCallback(() => {
    if (picked.length === 0) return;
    onAttach(picked);
    if (!request) setOpen(false);
  }, [onAttach, picked, request, setOpen]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        data-testid="dialog-agent-library-attachment-picker"
        className="flex h-[min(800px,88vh)] w-[calc(100vw-2rem)] max-w-[1400px] flex-col gap-0 overflow-hidden p-0 sm:max-w-[1400px]"
      >
        <DialogHeader className="shrink-0 px-5 pb-3 pt-5">
          <DialogTitle className="flex items-center gap-2">
            <ImagesIcon className="size-4" />
            {request ? "Choose a Library reference" : "Add from Library"}
          </DialogTitle>
          <DialogDescription>
            {request
              ? "Choose one image to send to the agent for this request."
              : single
                ? "Choose one image reference to include with your next message."
                : "Choose raster references to include with your next message."}
          </DialogDescription>
          {request && (
            <form
              className="flex gap-2 pt-2"
              onSubmit={(event) => {
                event.preventDefault();
                const next = draftQuery.trim();
                if (!next || next === query) return;
                setQuery(next);
                if (scrollRef.current) scrollRef.current.scrollTop = 0;
              }}
            >
              <Input
                type="search"
                aria-label="Search the Library"
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                disabled={fixed}
                maxLength={2048}
              />
              <Button type="submit" variant="outline" disabled={fixed}>
                Search
              </Button>
            </form>
          )}
        </DialogHeader>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5">
          {request ? (
            <LibraryExplorerView
              key={query}
              initialSource={searchSource}
              loadPage={resolveLibraryExplorerPage}
              onToggle={toggleSearchResult}
              selectedIds={selectedIds}
              scrollContainerRef={scrollRef}
              disabled={fixed}
              compact
            />
          ) : (
            <ReferenceGallery
              onPick={toggle}
              selectedIds={selectedIds}
              scrollContainerRef={scrollRef}
              compact
              attachmentImagesOnly
            />
          )}
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
                    disabled={fixed}
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
          {request?.error && (
            <p role="alert" className="pt-2 text-xs text-destructive">
              {request.error}
            </p>
          )}
          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            {request && !request.retry && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={request.skip}
              >
                Skip
              </Button>
            )}
            <Button
              type="button"
              disabled={busy || (!request?.retry && picked.length === 0)}
              onClick={request?.retry ?? attach}
            >
              {request
                ? request.retry
                  ? "Retry answer"
                  : "Use reference"
                : `Add ${picked.length > 0 ? picked.length : ""} reference${picked.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
