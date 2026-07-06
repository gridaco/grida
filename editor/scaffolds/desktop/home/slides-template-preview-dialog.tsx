"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { Button } from "@app/ui/components/button";
import { cn } from "@app/ui/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@app/ui/components/carousel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@app/ui/components/dialog";
import type { SlidesTemplate } from "./slides-template-loader";

/**
 * `SlidesTemplatePreviewDialog` — the "eye" button's larger-context view of a
 * template: a big page preview with prev/next paging and a filmstrip of every
 * page (a real embla {@link Carousel} — magnet snapping, arrow-key a11y, and
 * trackpad/mouse-wheel scrolling), plus a "Use this template" action that
 * prefills the composer (same as clicking the card) and closes. Pages are the
 * deck's REAL slides (see `slides-template-loader.ts`).
 */
export function SlidesTemplatePreviewDialog({
  template,
  open,
  onOpenChange,
  onUse,
}: {
  template: SlidesTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUse: (prompt: string) => void;
}) {
  const count = template.pages.length;
  const [page, setPage] = useState(0);
  const [thumbApi, setThumbApi] = useState<CarouselApi>();

  // Carousel → page: track the snap CLOSEST to the LIVE scroll position on every
  // "scroll" tick and reflect it into `page` — so the big preview follows the
  // strip immediately as you wheel/drag, not once the momentum settles. (Embla's
  // "select" fires only on settle, which is why scrolling felt laggy while
  // single keyboard steps — which settle at once — felt instant.)
  useEffect(() => {
    if (!thumbApi) return;
    const update = () => {
      const snaps = thumbApi.scrollSnapList();
      const progress = thumbApi.scrollProgress();
      let closest = 0;
      let min = Infinity;
      for (let i = 0; i < snaps.length; i++) {
        const d = Math.abs(snaps[i] - progress);
        if (d < min) {
          min = d;
          closest = i;
        }
      }
      setPage(closest);
    };
    update();
    thumbApi.on("scroll", update);
    thumbApi.on("reInit", update);
    return () => {
      thumbApi.off("scroll", update);
      thumbApi.off("reInit", update);
    };
  }, [thumbApi]);

  // Reopen always starts at the title slide (jump, no animation).
  useEffect(() => {
    if (open) thumbApi?.scrollTo(0, true);
  }, [open, thumbApi]);

  // Explicit navigation defers to embla: `scrollPrev`/`scrollNext` step from
  // embla's OWN target index, which it advances synchronously on each call — so
  // five fast clicks queue 1→2→3→4→5 and glide through, instead of all reading
  // the scroll-lagged `page` and landing on the same +1. `page` still follows
  // from the scroll listener above (it drives the preview/counter/highlight),
  // but it's never the source of a navigation target.

  // Memoized so embla isn't re-initialized on every render (page changes each
  // scroll tick) — a re-init would reset the scroll position mid-gesture.
  // `containScroll: false` lets the selected page center even at the ends (the
  // default "trimSnaps" would pin the first/last to the edge instead).
  const carouselOpts = useMemo(
    () => ({ align: "center" as const, containScroll: false as const }),
    []
  );
  // Trackpad / mouse-wheel scrolling for the filmstrip (embla has no built-in
  // wheel support). `forceWheelAxis: "x"` maps a vertical mouse wheel onto the
  // horizontal strip, so a plain wheel scrubs it — not just trackpad panning.
  const carouselPlugins = useMemo(
    () => [WheelGesturesPlugin({ forceWheelAxis: "x" })],
    []
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle>{template.title}</DialogTitle>
          <DialogDescription>{count} slides</DialogDescription>
        </DialogHeader>

        <div className="aspect-video overflow-hidden rounded-lg border">
          {/* eslint-disable-next-line @next/next/no-img-element -- blob object URL; next/image can't optimize it */}
          <img
            src={template.pages[page]?.url}
            alt={template.pages[page]?.name}
            draggable={false}
            className="size-full object-cover"
          />
        </div>

        <div className="flex items-center justify-center gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => thumbApi?.scrollPrev()}
            disabled={page === 0}
            aria-label="Previous slide"
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {page + 1} / {count}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => thumbApi?.scrollNext()}
            disabled={page === count - 1}
            aria-label="Next slide"
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>

        {/* Thumbnail filmstrip — a real embla carousel (magnet snap, arrow-key
            a11y, wheel/trackpad). Full-bleed past the dialog's `p-6` so it runs
            edge-to-edge instead of being culled by the padding: the canonical
            bleed idiom (`w-[calc(100%+3rem)] -mx-6`) keeps it occupying exactly
            the column in layout — so it can't blow the dialog width out — while
            painting 48px (2×`p-6`) wider; `min-w-0` stops the `shrink-0` thumbs
            from forcing the column wider. The inner track re-adds the inset
            (`px-6`) so the first/last thumb line up with the content, plus
            `py-1.5` so the selected thumb's `ring` isn't clipped by the embla
            viewport's `overflow-hidden`, and each edge fades under a gradient. */}
        <div className="relative -mx-6 w-[calc(100%+3rem)] min-w-0">
          <Carousel
            setApi={setThumbApi}
            opts={carouselOpts}
            plugins={carouselPlugins}
            className="w-full"
          >
            <CarouselContent className="ml-0 gap-2 px-6 py-1.5">
              {template.pages.map((p, i) => (
                <CarouselItem key={p.id} className="basis-auto pl-0">
                  <button
                    type="button"
                    onClick={() => thumbApi?.scrollTo(i)}
                    aria-label={p.name}
                    aria-current={i === page}
                    className={cn(
                      "aspect-video w-16 shrink-0 overflow-hidden rounded border transition",
                      i === page
                        ? "border-primary ring-2 ring-primary/40"
                        : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob object URL; next/image can't optimize it */}
                    <img
                      src={p.url}
                      alt={p.name}
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </button>
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>
          {/* Edge fades — same width as the restored `px-6` inset. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
        </div>

        <DialogFooter>
          <Button
            onClick={() => {
              onUse(template.prompt);
              onOpenChange(false);
            }}
          >
            Use this template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
