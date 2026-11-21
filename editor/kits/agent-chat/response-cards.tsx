import { useEffect, useRef, useState } from "react";
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
import type { WebPreview } from "@grida/desktop-bridge";
import { toast } from "sonner";
import type { ResponseCards } from "@/lib/agent-chat/response-cards";
import type { Browser } from "@/lib/desktop/browser";
import { observeWebPreview } from "./web-preview-visibility";

export function ChatResponseCards({
  cards,
  open,
  loadPreview,
}: {
  cards: readonly ResponseCards.Card[];
  open: Browser.OpenHandler;
  loadPreview?: Browser.PreviewLoader;
}) {
  return (
    <div className="flex flex-col gap-2">
      {cards.map((card) => {
        switch (card.kind) {
          case "web-preview":
            return (
              <WebPreviewCard
                key={card.action.url}
                action={card.action}
                open={open}
                loadPreview={loadPreview}
              />
            );
        }
      })}
    </div>
  );
}

function WebPreviewCard({
  action,
  open,
  loadPreview,
}: {
  action: Browser.OpenIntent;
  open: Browser.OpenHandler;
  loadPreview?: Browser.PreviewLoader;
}) {
  const target = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<{
    loader: Browser.PreviewLoader;
    metadata: WebPreview.Metadata | null;
  } | null>(null);
  const [failedIcon, setFailedIcon] = useState<string | null>(null);
  const { url } = action;
  const host = new URL(url).host;
  useEffect(() => {
    if (!target.current || !loadPreview) return;
    return observeWebPreview(target.current, url, loadPreview, (metadata) =>
      setResult({ loader: loadPreview, metadata })
    );
  }, [url, loadPreview]);
  const metadata = result?.loader === loadPreview ? result?.metadata : null;
  const title = metadata?.title || metadata?.productLabel || "Web preview";
  const product = metadata?.productLabel;
  const icon = metadata?.favicon?.dataUrl;
  return (
    <div
      ref={target}
      role="group"
      aria-label="Web preview"
      className="group/preview relative isolate flex min-w-0 cursor-pointer select-none items-center gap-3 rounded-lg border bg-card px-4 py-3 text-card-foreground transition-colors hover:bg-accent/40"
    >
      {icon && icon !== failedIcon ? (
        // eslint-disable-next-line @next/next/no-img-element -- bounded native raster data URI
        <img
          src={icon}
          alt=""
          width={24}
          height={24}
          className="size-6 shrink-0 object-contain"
          onError={() => setFailedIcon(icon)}
        />
      ) : (
        <GlobeIcon
          className="size-6 shrink-0 text-blue-500 dark:text-blue-400"
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{title}</span>
          {product && product !== title && (
            <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
              {product}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {metadata?.description || host}
          </span>
          <span
            aria-hidden="true"
            className="hidden shrink-0 group-hover/preview:block"
          >
            Open preview
          </span>
        </div>
      </div>
      <div className="flex shrink-0">
        {/* Open covers the card surface, with the menu trigger above it. */}
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="cursor-pointer rounded-r-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
          aria-label={`Open web preview at ${host}`}
          onClick={() => open(action)}
        >
          Open
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon-xs"
              className="relative z-10 cursor-pointer rounded-l-none border-l-0"
              aria-label="Web preview open options"
            >
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => open({ ...action, target: "external" })}
            >
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
