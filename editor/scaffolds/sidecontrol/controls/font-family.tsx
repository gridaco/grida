import React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@app/ui/components/popover";
import { WorkbenchUI } from "@/components/workbench";
import { CaretSortIcon } from "@radix-ui/react-icons";
import { useGridaFontsSearch } from "@/hooks/use-grida-fonts-search";
import { cn } from "@app/ui/lib/utils";
import grida from "@grida/schema";
import {
  useCurrentEditor,
  useEditorState as useCanvasEditorState,
} from "@/grida-canvas-react";
import type { TMixed } from "./utils/types";
import { FontFamilyDropdown, useFontFamilyList } from "./font-family-dropdown";

// The font-list context + the virtualized `FontFamilyDropdown` live in
// `./font-family-dropdown` (editor-agnostic, no `@/grida-canvas-react`
// binding) so other hosts can reuse them. Re-exported here for back-compat:
// existing callers import `FontFamilyListProvider` from `controls/font-family`.
export { FontFamilyListProvider } from "./font-family-dropdown";

// ---------------------------------------------------------------------------
// FontFamilyControl — the public, purpose-built control
// ---------------------------------------------------------------------------

/**
 * Purpose-built font-family picker with async preview support.
 *
 * Unlike other property controls that use the generic `PropertyEnumV2` +
 * `usePropertyPreview` combo, font-family requires special treatment:
 *
 * 1. **Async apply** — loading a font involves network fetches; the preview
 *    snapshot must only be captured after the font is loaded.
 * 2. **Virtualised list** — 1600+ Google Fonts need virtualisation.
 * 3. **No eager preview** — opening the picker must NOT trigger a preview.
 *    Preview only starts on the first actual hover/keyboard highlight.
 * 4. **Stable scroll** — the initial scroll-to-selected must not conflict
 *    with subsequent user scrolling.
 *
 * The component owns the full preview lifecycle internally so consumers only
 * need to provide the target `selection` (node ids).
 */
export function FontFamilyControl({
  id,
  value,
  selection,
}: {
  id?: string;
  value?: TMixed<string>;
  /** Node IDs to apply the font-family change to */
  selection: string[];
}) {
  const editor = useCurrentEditor();
  const list = useFontFamilyList();
  const usedFonts = useCanvasEditorState(editor, (state) =>
    state.fontfaces.map((f) => f.family)
  );
  const { fonts: popularFontsData } = useGridaFontsSearch({
    sort: "popular",
    limit: 100,
  });
  const popularFonts = React.useMemo(
    () => popularFontsData.map((f) => f.family),
    [popularFontsData]
  );

  const mixed = value === grida.mixed;
  const displayValue = mixed ? "" : ((value as string) ?? "");
  const [open, setOpen] = React.useState(false);
  const listId = id ? `${id}-list` : "font-family-combobox-list";

  // --- Preview lifecycle state ---
  // Preview is lazy: we don't call previewStart on open, only on the first
  // seek so that merely opening the picker has zero side effects.
  const previewActiveRef = React.useRef(false);
  const committedRef = React.useRef<string | null>(null);
  const [committedValue, setCommittedValue] = React.useState<string | null>(
    null
  );
  const seekGenRef = React.useRef(0);
  // Set to true when handleSelect is in-flight so handleOpenChange
  // knows the close is a commit, not a dismiss.
  const isCommittingRef = React.useRef(false);

  const ensurePreviewStarted = React.useCallback(() => {
    if (previewActiveRef.current) return;
    previewActiveRef.current = true;
    committedRef.current = displayValue;
    setCommittedValue(displayValue);
    editor.doc.previewStart("font-family");
  }, [editor, displayValue]);

  const handleHighlighted = React.useCallback(
    (fontFamily: string | null) => {
      const gen = ++seekGenRef.current;
      if (fontFamily == null) {
        // Unhovered — revert to committed if preview is active
        if (!previewActiveRef.current || committedRef.current == null) return;
        const revertTo = committedRef.current;
        void Promise.all(
          selection.map((id) =>
            editor.changeTextNodeFontFamilySync(id, revertTo)
          )
        ).then(() => {
          if (gen === seekGenRef.current && previewActiveRef.current) {
            editor.doc.previewSet();
          }
        });
        return;
      }

      // First real seek — lazily start the preview session
      ensurePreviewStarted();

      void Promise.all(
        selection.map((id) =>
          editor.changeTextNodeFontFamilySync(id, fontFamily)
        )
      ).then(() => {
        if (gen === seekGenRef.current && previewActiveRef.current) {
          editor.doc.previewSet();
        }
      });
    },
    [editor, selection, ensurePreviewStarted]
  );

  const handleSelect = React.useCallback(
    (fontFamily: string) => {
      const gen = ++seekGenRef.current;

      // If no preview was active yet (user clicked directly without hovering),
      // start a preview so the commit produces a clean undo entry.
      ensurePreviewStarted();

      // Signal that a commit is in-flight so handleOpenChange skips discard.
      isCommittingRef.current = true;

      void Promise.all(
        selection.map((id) =>
          editor.changeTextNodeFontFamilySync(id, fontFamily)
        )
      ).then(() => {
        // Only commit if this is still the latest select operation.
        if (gen !== seekGenRef.current) return;

        editor.doc.previewSet();
        editor.doc.previewCommit();

        // Reset preview state after the commit succeeds.
        previewActiveRef.current = false;
        committedRef.current = null;
        setCommittedValue(null);
        isCommittingRef.current = false;
      });

      // Close the popover immediately for responsive UI.
      setOpen(false);
    },
    [editor, selection, ensurePreviewStarted]
  );

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next && !isCommittingRef.current) {
        // Closing without selection — discard if a preview was active
        if (previewActiveRef.current) {
          seekGenRef.current++;
          editor.doc.previewDiscard();
          previewActiveRef.current = false;
          committedRef.current = null;
          setCommittedValue(null);
        }
      }
    },
    [editor]
  );

  return (
    <Popover modal={false} open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          className={cn(
            "flex w-full justify-between items-center overflow-hidden",
            WorkbenchUI.inputVariants({ size: "xs" })
          )}
        >
          <span className="line-clamp-1 text-left">
            {mixed ? "mixed" : value || "Font"}
          </span>
          <CaretSortIcon className="ml-2 size-4 shrink-0 text-muted-foreground opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0"
        side="right"
        align="start"
        collisionPadding={8}
      >
        <FontFamilyDropdown
          fonts={list}
          usedFonts={usedFonts}
          popularFonts={popularFonts}
          selectedFontFamily={displayValue}
          committedFontFamily={committedValue}
          onHighlighted={handleHighlighted}
          onSelect={handleSelect}
          listId={listId}
        />
      </PopoverContent>
    </Popover>
  );
}
