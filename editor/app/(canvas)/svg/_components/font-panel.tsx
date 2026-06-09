"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronsUpDownIcon } from "lucide-react";
import * as google from "@grida/fonts/google";
import { useGridaFontsSearch } from "@/hooks/use-grida-fonts-search";
import { FontFamilyDropdown } from "@/scaffolds/sidecontrol/controls/font-family-dropdown";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@app/ui/lib/utils";

/**
 * Google-Fonts family picker for the SVG editor demo.
 *
 * Reuses the *core* — the editor-agnostic, virtualized {@link FontFamilyDropdown}
 * (the same full-catalog list + search + category filter the main Canvas
 * inspector uses) — instead of rebuilding a lesser, capped copy. We only supply
 * a thin host shell: the compact trigger, the full webfont list, and a
 * commit-on-pick handler. We do NOT wrap it with the Canvas control's async
 * hover-preview lifecycle (that lives in `@/grida-canvas-react`, the wrong
 * editor here); picking writes one `set_property` = one undo step.
 */

// A stable empty array — the SVG demo has no "fonts used in document" feed yet,
// so the dropdown's "In this file" category is empty. Module-level so the
// reference is stable across renders (the dropdown memoizes on it).
const NO_USED_FONTS: string[] = [];

// ── Font loading (host I/O) ────────────────────────────────────────────────
// The headless `@grida/svg-editor` is DOM-agnostic and does not load fonts —
// font loading is a host-owned concern (I/O), per sdk-design's deciding table.
// The demo renders SVG into the live DOM, so a picked family only *renders* in
// the canvas once its stylesheet is present. We inject the Google Fonts CSS
// link on pick, deduped by family. Generic families (sans-serif, …) never
// reach here — only real Google families chosen from the list do.
const _loadedFonts = new Set<string>();

export function ensureGoogleFont(family: string): void {
  if (typeof document === "undefined") return;
  const fam = family?.trim();
  if (!fam || _loadedFonts.has(fam)) return;
  _loadedFonts.add(fam);
  const href = google.csslink({ fontFamily: fam });
  if (
    document.head.querySelector(`link[data-grida-google-font][href="${href}"]`)
  )
    return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-grida-google-font", fam);
  document.head.appendChild(link);
}

/**
 * Reduce a CSS `font-family` value to its primary family name for display and
 * for the selected-row check — strips a fallback list (`"Roboto", sans-serif`)
 * and surrounding quotes.
 */
export function primaryFamily(value: string): string {
  const first = value?.split(",")[0]?.trim() ?? "";
  return first.replace(/^['"]|['"]$/g, "");
}

/**
 * The full Google Fonts catalog (~1900 families, with variable-font axes).
 * Fetched once and cached by SWR across the session — the Canvas hosts feed
 * this same list into `FontFamilyListProvider` from editor state; the SVG demo
 * has no such state, so it loads the list directly.
 */
function useWebfontList(): google.GoogleWebFontListItem[] {
  const { data } = useSWR("grida-webfont-list-vf", () =>
    google.fetchWebfontList(true)
  );
  return data?.items ?? [];
}

export function FontFamilyPicker({
  value,
  onSelect,
}: {
  /** Current CSS `font-family` value (may include a fallback list). */
  value: string;
  onSelect: (family: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fonts = useWebfontList();
  const { fonts: popularData } = useGridaFontsSearch({
    sort: "popular",
    limit: 100,
  });
  const popularFonts = useMemo(
    () => popularData.map((f) => f.family),
    [popularData]
  );
  const selected = primaryFamily(value);

  return (
    <Popover modal={false} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="Font family"
          data-testid="font-family-trigger"
          className={cn(
            "flex w-full items-center justify-between gap-1 overflow-hidden rounded-md border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            WorkbenchUI.inputVariants({ size: "xs" })
          )}
        >
          <span className="truncate text-left">{selected || "Font"}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="left"
        sideOffset={8}
        className="w-72 p-0"
        data-testid="font-family-popover"
      >
        <FontFamilyDropdown
          fonts={fonts}
          usedFonts={NO_USED_FONTS}
          popularFonts={popularFonts}
          selectedFontFamily={selected}
          committedFontFamily={null}
          onSelect={(family) => {
            ensureGoogleFont(family);
            onSelect(family);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
