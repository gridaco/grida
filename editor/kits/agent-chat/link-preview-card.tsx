"use client";

import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from "react";
import { ExternalLinkIcon } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@app/ui/components/popover";
import type { chatWebLinkIcon } from "@/components/chat-web-link";
import type { Browser } from "@/lib/desktop/browser";
import {
  handleBrowserLinkClick,
  usePagePreviewSnapshot,
} from "@/lib/desktop/browser-open-context";
import type { PagePreviews } from "@/lib/desktop/page-previews";
import { PreviewFavicon } from "./preview-favicon";

const HOVER_DELAY_MS = 300;
const CLOSE_DELAY_MS = 120;

/** Shows destination details while preserving the inline link's usual actions. */
export function LinkPreviewCard({
  url,
  icon,
  openLink,
  preview,
  children,
}: {
  url: string;
  icon: NonNullable<ReturnType<typeof chatWebLinkIcon>>;
  openLink: Browser.OpenHandler | null;
  preview: PagePreviews.Source;
  children: ReactElement<ComponentProps<"a">>;
}) {
  const host = new URL(url).host;
  const trigger = useRef<HTMLAnchorElement>(null);
  const action = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const focusAction = useRef(false);
  const [open, setOpen] = useState(false);
  const { metadata, loading } = usePagePreviewSnapshot(preview);
  const image = metadata?.image?.dataUrl;
  const product = metadata?.productLabel;
  const title = metadata?.title || product;
  const hasText = title || metadata?.description;

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => (open ? preview.request() : undefined), [open, preview]);

  function cancelTimer() {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }

  function changeOpen(next: boolean) {
    cancelTimer();
    if (!next) focusAction.current = false;
    setOpen(next);
  }

  function schedule(next: boolean) {
    cancelTimer();
    if (open === next) return;
    timer.current = window.setTimeout(
      () => {
        if (
          !next &&
          (trigger.current?.matches(":focus-visible") ||
            action.current === document.activeElement)
        ) {
          cancelTimer();
          return;
        }
        changeOpen(next);
      },
      next ? HOVER_DELAY_MS : CLOSE_DELAY_MS
    );
  }

  function returnToLink() {
    trigger.current?.focus({ preventScroll: true });
    changeOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverAnchor
        asChild
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") schedule(true);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") schedule(false);
        }}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) schedule(true);
        }}
        onBlur={(event) => {
          if (event.relatedTarget !== action.current) schedule(false);
        }}
        onKeyDown={(event) => {
          if (event.defaultPrevented) return;
          if (event.key === "Escape" && (open || timer.current !== undefined)) {
            event.preventDefault();
            event.stopPropagation();
            changeOpen(false);
          } else if (
            event.key === "ArrowDown" ||
            (open && event.key === "Tab" && !event.shiftKey)
          ) {
            event.preventDefault();
            event.stopPropagation();
            if (action.current) action.current.focus({ preventScroll: true });
            else {
              focusAction.current = true;
              changeOpen(true);
            }
          }
        }}
        aria-keyshortcuts="ArrowDown"
      >
        {cloneElement(
          children,
          { ref: trigger },
          <PreviewFavicon metadata={metadata} inline />,
          children.props.children
        )}
      </PopoverAnchor>
      <PopoverContent
        aria-label="Link preview"
        aria-busy={loading}
        align="start"
        sideOffset={8}
        className="w-88 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl p-0 motion-reduce:animate-none"
        onPointerEnter={cancelTimer}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") schedule(false);
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (focusAction.current) {
            focusAction.current = false;
            action.current?.focus({ preventScroll: true });
          }
        }}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onInteractOutside={(event) => {
          if (
            event.target instanceof Node &&
            trigger.current?.contains(event.target)
          )
            event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (document.activeElement === action.current) returnToLink();
          else changeOpen(false);
        }}
        onKeyDownCapture={(event) => {
          if (event.key !== "Tab") return;
          returnToLink();
          if (event.shiftKey) event.preventDefault();
        }}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
          <PreviewFavicon
            metadata={metadata}
            className="size-4 shrink-0 text-muted-foreground"
            fallback={
              <span
                data-chat-web-link={icon}
                aria-hidden
                className="size-4 shrink-0 bg-current text-muted-foreground [mask:var(--chat-web-link-icon)_center/contain_no-repeat]"
              />
            }
          />
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {host}
          </span>
          <Button asChild size="xs" variant="ghost">
            <a
              ref={action}
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${host}`}
              onClick={(event) => {
                if (handleBrowserLinkClick(event, openLink)) changeOpen(false);
              }}
            >
              Open <ExternalLinkIcon aria-hidden />
            </a>
          </Button>
        </div>
        {(image || hasText) && (
          <div className="border-t">
            {image && (
              // eslint-disable-next-line @next/next/no-img-element -- bounded native raster data URI
              <img
                src={image}
                alt=""
                className="aspect-[1200/630] w-full bg-muted object-cover"
              />
            )}
            {hasText && (
              <div className="grid gap-0.5 px-2.5 py-2.5 text-sm">
                {title && (
                  <div className="flex items-baseline gap-2">
                    <p className="line-clamp-2 min-w-0 wrap-anywhere font-medium">
                      {title}
                    </p>
                    {product && product !== title && (
                      <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                        {product}
                      </span>
                    )}
                  </div>
                )}
                {metadata?.description && (
                  <p className="line-clamp-3 wrap-anywhere text-xs text-muted-foreground">
                    {metadata.description}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
