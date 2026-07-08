"use client";

/**
 * `SlidesTemplateGallery` — the slides preset's stand-in for the reference
 * gallery. The home's library corpus is image/video pins (see
 * {@link ReferenceGallery}), which isn't meaningful for decks, so slides mode
 * shows a small grid of starting templates instead.
 *
 * Templates are the real bundled `.canvas` decks served from
 * `/templates/slides/` (see `slides-template-loader.ts` — loaded via dynamic
 * `import()` so the unzip/dotcanvas machinery stays out of the home chunk).
 * Each card is a {@link SlideScrubPreview} (hover-scrub through the deck's
 * real pages) with an "eye" button that opens the
 * {@link SlidesTemplatePreviewDialog} for a larger view. Clicking the card
 * SELECTS the template (via `onPickTemplate`) into the composer — like
 * attaching a reference, single-select. It does NOT start a project; the
 * composer's send materializes the chosen deck and hands it to the agent.
 */

import { useEffect, useState } from "react";
import { CheckIcon, EyeIcon } from "lucide-react";
import { cn } from "@app/ui/lib/utils";
import { SlideScrubPreview } from "./slide-scrub-preview";
import { SlidesTemplatePreviewDialog } from "./slides-template-preview-dialog";
import type { SlidesTemplate } from "./slides-template-loader";

/** One template card: a scrubbable page preview + an "eye" that opens the
 *  larger preview dialog. The scrub surface and the eye are DOM SIBLINGS (not
 *  nested buttons) — the eye sits on top, so a click on it opens the dialog
 *  without also firing the card's select. A selected card gets a primary ring +
 *  a check badge (matching the reference gallery), so single-select reads at a
 *  glance; clicking the selected card again deselects it. */
function SlidesTemplateCard({
  template,
  selected,
  disabled,
  onPick,
}: {
  template: SlidesTemplate;
  selected: boolean;
  disabled: boolean;
  onPick: (template: SlidesTemplate) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div
      className={cn(
        "group relative aspect-video overflow-hidden rounded-lg border transition hover:shadow-sm",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "hover:border-primary/50"
      )}
    >
      {/* Scrub surface = the select target (fills the card). */}
      <button
        type="button"
        disabled={disabled}
        aria-pressed={selected}
        onClick={() => onPick(template)}
        aria-label={`${selected ? "Deselect" : "Select"} ${template.title} template`}
        title={template.title}
        className="absolute inset-0 disabled:pointer-events-none disabled:opacity-50"
      >
        <SlideScrubPreview
          count={template.pages.length}
          renderFrame={(i) => (
            // eslint-disable-next-line @next/next/no-img-element -- blob object URL; next/image can't optimize it
            <img
              src={template.pages[i].url}
              alt={template.pages[i].name}
              draggable={false}
              className="size-full object-cover"
            />
          )}
          className="size-full"
        />
      </button>

      {/* Selected badge — top-left (the eye sits top-right), so single-select
          is legible without hover. Primary fill matches the reference gallery. */}
      {selected && (
        <div className="absolute left-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <CheckIcon className="size-3.5" />
        </div>
      )}

      {/* Eye → larger-context preview dialog. On top of the scrub surface. */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setPreviewOpen(true)}
        aria-label={`Preview ${template.title}`}
        className="absolute right-1.5 top-1.5 z-10 flex size-7 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition hover:bg-background focus-visible:opacity-100 group-hover:opacity-100 disabled:pointer-events-none"
      >
        <EyeIcon className="size-3.5" />
      </button>

      <SlidesTemplatePreviewDialog
        template={template}
        selected={selected}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onPick={onPick}
      />
    </div>
  );
}

/**
 * `onPickTemplate` receives the clicked {@link SlidesTemplate} to toggle it in
 * the composer's single-select tray — it does NOT start a project (the composer
 * send does). `selectedName` is the currently-picked template's `name` (or null)
 * so the matching card shows its selected state. The gallery is disabled while a
 * start is in flight (`disabled`).
 */
export function SlidesTemplateGallery({
  onPickTemplate,
  selectedName,
  disabled = false,
}: {
  onPickTemplate: (template: SlidesTemplate) => void;
  selectedName: string | null;
  disabled?: boolean;
}) {
  // null = loading (skeletons); [] = load failed / nothing to show.
  const [templates, setTemplates] = useState<SlidesTemplate[] | null>(null);
  useEffect(() => {
    let alive = true;
    import("./slides-template-loader")
      .then((m) => m.loadSlidesTemplates())
      .then((t) => alive && setTemplates(t))
      .catch((err) => {
        console.error("[slides-templates] load failed:", err);
        if (alive) setTemplates([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div
      data-testid="desktop-home-slides-templates"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {templates === null
        ? Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="aspect-video animate-pulse rounded-lg border bg-muted"
            />
          ))
        : templates.map((t) => (
            <SlidesTemplateCard
              key={t.name}
              template={t}
              selected={t.name === selectedName}
              disabled={disabled}
              onPick={onPickTemplate}
            />
          ))}
    </div>
  );
}
