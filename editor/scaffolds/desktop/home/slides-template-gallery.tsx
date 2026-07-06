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
 * PREFILLS the composer with the template's seed prompt (via `onUseTemplate`)
 * — it does NOT start a session.
 */

import { useEffect, useState } from "react";
import { EyeIcon } from "lucide-react";
import { SlideScrubPreview } from "./slide-scrub-preview";
import { SlidesTemplatePreviewDialog } from "./slides-template-preview-dialog";
import type { SlidesTemplate } from "./slides-template-loader";

/** One template card: a scrubbable page preview + an "eye" that opens the
 *  larger preview dialog. The scrub surface and the eye are DOM SIBLINGS (not
 *  nested buttons) — the eye sits on top, so a click on it opens the dialog
 *  without also firing the card's prefill. */
function SlidesTemplateCard({
  template,
  disabled,
  onUse,
}: {
  template: SlidesTemplate;
  disabled: boolean;
  onUse: (prompt: string) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg border transition hover:border-primary/50 hover:shadow-sm">
      {/* Scrub surface = the prefill target (fills the card). */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onUse(template.prompt)}
        aria-label={`Use ${template.title} template`}
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
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onUse={onUse}
      />
    </div>
  );
}

/**
 * `onUseTemplate` receives the template's seed prompt — the host prefills the
 * composer with it and focuses the input. It does NOT start a session; the user
 * sends when ready.
 */
export function SlidesTemplateGallery({
  onUseTemplate,
  disabled = false,
}: {
  onUseTemplate: (prompt: string) => void;
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
              disabled={disabled}
              onUse={onUseTemplate}
            />
          ))}
    </div>
  );
}
