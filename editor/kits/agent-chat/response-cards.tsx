"use client";

import { useEffect, useRef } from "react";
import {
  ChevronDownIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@app/ui/components/dropdown-menu";
import { toast } from "sonner";
import type { ResponseCards } from "@/lib/agent-chat/response-cards";
import type { Browser } from "@/lib/desktop/browser";
import {
  usePagePreview,
  usePagePreviewSnapshot,
} from "@/lib/desktop/browser-open-context";
import { observeWebPreview } from "./web-preview-visibility";
import { PreviewFavicon } from "./preview-favicon";

const previewIconClassName = "size-6 shrink-0 text-blue-500 dark:text-blue-400";

export function ChatResponseCards({
  cards,
  open,
}: {
  cards: readonly ResponseCards.Card[];
  open: Browser.OpenHandler;
}) {
  return (
    <div className="flex flex-col gap-2">
      {cards.map((card) => {
        switch (card.kind) {
          case "web-preview":
            return <WebPreviewCard key={card.url} url={card.url} open={open} />;
        }
      })}
    </div>
  );
}

function WebPreviewCard({
  url,
  open,
}: {
  url: string;
  open: Browser.OpenHandler;
}) {
  const target = useRef<HTMLDivElement>(null);
  const preview = usePagePreview(url);
  const { metadata } = usePagePreviewSnapshot(preview);
  const host = new URL(url).host;
  useEffect(() => {
    if (!target.current || !preview) return;
    return observeWebPreview(target.current, preview.request);
  }, [preview]);
  const title = metadata?.title || metadata?.productLabel || "Web preview";
  const product = metadata?.productLabel;
  const openPage = () => open(url);
  return (
    <div
      ref={target}
      role="group"
      aria-label="Web preview"
      className="group/preview relative isolate flex min-w-0 cursor-pointer select-none items-center gap-3 rounded-lg border bg-card px-4 py-3 text-card-foreground transition-colors hover:bg-accent/40"
    >
      <PreviewFavicon
        metadata={metadata}
        className={previewIconClassName}
        fallback={<GlobeIcon className={previewIconClassName} aria-hidden />}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {product && product !== title && (
            <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
              {product}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          <span className="block truncate group-hover/preview:sr-only">
            {metadata?.description || host}
          </span>
          <span
            aria-hidden="true"
            className="hidden truncate group-hover/preview:block"
          >
            Open preview
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className="absolute inset-0 cursor-pointer rounded-lg"
        onMouseDown={(event) => event.preventDefault()}
        onClick={openPage}
      />
      <div className="relative z-10 flex shrink-0">
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="cursor-pointer rounded-r-none"
          aria-label={`Open web preview at ${host}`}
          onClick={openPage}
        >
          Open
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className="cursor-pointer rounded-l-none border-l-0"
              aria-label="Web preview open options"
            >
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => open(url, "system")}>
              <ExternalLinkIcon />
              Open in default browser
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  toast.success("Link copied");
                } catch {
                  toast.error("Couldn't copy the link.");
                }
              }}
            >
              <CopyIcon />
              Copy link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
