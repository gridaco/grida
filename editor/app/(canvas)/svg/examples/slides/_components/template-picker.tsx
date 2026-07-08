"use client";

import * as React from "react";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { Button } from "@app/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import {
  LIGHT_SLIDES_TEMPLATE_NAME,
  slideTemplateFromPage,
  type SlideTemplate,
} from "./templates";

/**
 * Template picker trigger + popover. The popover is anchored to the sidebar
 * and opens to the right (`side="right"`, `align="start"`) so it sits next
 * to the slide list — matching the Figma reference where the picker reads
 * as a side panel that extends from the sidebar into the canvas area.
 *
 * Header mirrors the reference: a "Back" affordance, a breadcrumb-style
 * title ("Templates / <set name>"), and an "Add all slides" action that
 * inserts every template in order.
 */
export function TemplatePicker({
  onPick,
  onPickAll,
  triggerClassName,
}: {
  onPick: (tpl: SlideTemplate) => void;
  onPickAll?: (tpls: SlideTemplate[]) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [templates, setTemplates] = React.useState<SlideTemplate[] | null>(
    null
  );
  const [title, setTitle] = React.useState("Light slides");

  React.useEffect(() => {
    let alive = true;
    import("@/lib/slides-templates")
      .then((m) => m.SlidesTemplates.load(LIGHT_SLIDES_TEMPLATE_NAME))
      .then((deck) => {
        if (!alive) return;
        setTitle(deck.title);
        setTemplates(deck.pages.map(slideTemplateFromPage));
      })
      .catch((err) => {
        console.error("[slides-templates] failed to load light slides:", err);
        if (alive) setTemplates([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadedTemplates = templates ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={triggerClassName}
          title="New slide from template"
        >
          <span>New slide</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        alignOffset={-8}
        className="w-md p-0 overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-2 h-10 border-b border-border">
          <div className="flex items-center gap-1 min-w-0">
            <Button
              variant="ghost"
              size="icon-xs"
              className="shrink-0"
              onClick={() => setOpen(false)}
              title="Close"
            >
              <ArrowLeft />
            </Button>
            <div className="text-xs truncate">
              <span className="text-muted-foreground">Templates / </span>
              <span className="font-medium">{title}</span>
              <span className="text-muted-foreground"> by Grida</span>
            </div>
          </div>
          {onPickAll && (
            <Button
              variant="outline"
              size="xs"
              className="shrink-0"
              disabled={loadedTemplates.length === 0}
              onClick={() => {
                onPickAll(loadedTemplates);
                setOpen(false);
              }}
            >
              Add all slides
            </Button>
          )}
        </div>
        <div className="max-h-[640px] overflow-auto p-3">
          <div className="grid grid-cols-2 gap-3">
            {templates === null
              ? Array.from({ length: 6 }, (_, i) => (
                  <div
                    key={i}
                    className="w-full animate-pulse rounded border bg-muted"
                    style={{ aspectRatio: "16 / 9" }}
                  />
                ))
              : loadedTemplates.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => {
                      onPick(tpl);
                      setOpen(false);
                    }}
                    className="group/tpl text-left outline-none"
                    title={tpl.name}
                  >
                    <div
                      className="relative w-full overflow-hidden rounded border border-border/60 bg-card transition-colors group-hover/tpl:border-foreground/40 group-focus-visible/tpl:border-workbench-accent-sky"
                      style={{ aspectRatio: "16 / 9" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={tpl.thumbnailDataUri}
                        alt={tpl.name}
                        className="absolute inset-0 w-full h-full object-contain"
                        draggable={false}
                      />
                      <div className="absolute inset-0 bg-foreground/40 opacity-0 transition-opacity group-hover/tpl:opacity-100 group-focus-visible/tpl:opacity-100">
                        <Plus className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-6 text-background" />
                        <div className="absolute bottom-1.5 left-2 right-2 truncate text-[10px] font-medium text-background">
                          {tpl.name}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
