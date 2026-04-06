/**
 * Hooks for managing history-aware property changes in sidecontrol UI.
 *
 * **usePropertyPreview** — for hover-based controls (dropdowns, font pickers).
 */
import { useCallback, useRef, useState } from "react";
import { useCurrentEditor } from "../use-editor";

/**
 * Hook for hover-based preview property changes (dropdowns, font pickers).
 *
 * Manages the full preview lifecycle including revert-on-unhover.
 * The consumer provides an `apply` function that dispatches the value to
 * the store. The hook calls it at the right times — on seek, on revert,
 * on commit.
 *
 * Returns:
 * - `committedValue` — the value captured on open. Use for "checked" indicator.
 *    `null` when no preview is active (use the live value).
 * - `onOpen(currentValue)` — call when dropdown opens
 * - `onSeek(value | null | undefined)` — call on every hover/highlight change.
 *    When value is non-null: applies it and captures as tentative.
 *    When value is null/undefined: reverts to committed value.
 * - `onCommit(value?)` — call when user selects. Optionally applies value first.
 * - `onClose()` — call when dropdown closes without selection.
 *
 * @param label — history label for the preview session
 * @param apply — function that dispatches a value to the store
 *
 * @example
 * ```tsx
 * const preview = usePropertyPreview("font-style", (key) => {
 *   selection.forEach(id => editor.changeTextNodeFontStyle(id, { fontStyleKey: key }));
 * });
 *
 * <PropertyEnumV2
 *   value={preview.committedValue ?? liveValue}
 *   onOpenChange={(open) => open ? preview.onOpen(liveValue) : preview.onClose()}
 *   onValueSeeked={preview.onSeek}
 *   onValueChange={preview.onCommit}
 * />
 * ```
 */
export function usePropertyPreview<T>(
  label: string,
  apply: (value: T) => void
) {
  const editor = useCurrentEditor();
  const isOpen = useRef(false);
  const committedRef = useRef<T | null>(null);
  const [committedValue, setCommittedValue] = useState<T | null>(null);

  const onOpen = useCallback(
    (currentValue: T) => {
      if (isOpen.current) return;
      isOpen.current = true;
      committedRef.current = currentValue;
      setCommittedValue(currentValue);
      editor.doc.previewStart(label);
    },
    [editor, label]
  );

  const onSeek = useCallback(
    (value: T | null | undefined) => {
      if (!isOpen.current) return;
      if (value != null) {
        // Hover on an item — apply and capture as tentative
        apply(value);
        editor.doc.previewSet();
      } else {
        // Mouse left all items — revert to committed value
        if (committedRef.current != null) {
          apply(committedRef.current);
          editor.doc.previewSet();
        }
      }
    },
    [editor, apply]
  );

  const onCommit = useCallback(
    (value?: T) => {
      if (!isOpen.current) return;
      isOpen.current = false;
      committedRef.current = null;
      setCommittedValue(null);
      if (value != null) {
        apply(value);
      }
      editor.doc.previewCommit();
    },
    [editor, apply]
  );

  const onClose = useCallback(() => {
    if (!isOpen.current) return;
    isOpen.current = false;
    committedRef.current = null;
    setCommittedValue(null);
    editor.doc.previewDiscard();
  }, [editor]);

  return { committedValue, onOpen, onSeek, onCommit, onClose };
}
