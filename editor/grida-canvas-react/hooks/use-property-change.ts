/**
 * Hooks for managing history-aware property changes in sidecontrol UI.
 *
 * **usePropertyPreview** — for hover-based controls (dropdowns, font pickers).
 * **useAsyncPropertyPreview** — same, but for async apply fns (e.g. font-family loading).
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
  // Tracks whether onCommit has been called. Prevents onClose from
  // discarding a preview that was already committed — necessary because
  // some UI components fire onOpenChange(false) after onValueChange.
  const didCommit = useRef(false);

  const onOpen = useCallback(
    (currentValue: T) => {
      if (isOpen.current) return;
      isOpen.current = true;
      didCommit.current = false;
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
      if (!isOpen.current && !editor.doc.isPreviewActive) return;
      isOpen.current = false;
      didCommit.current = true;
      committedRef.current = null;
      setCommittedValue(null);
      if (value != null) {
        apply(value);
      }
      // Capture the final state so the committed delta reflects the
      // actual value, then push it to the undo stack.
      editor.doc.previewSet();
      editor.doc.previewCommit();
    },
    [editor, apply]
  );

  const onClose = useCallback(() => {
    if (didCommit.current) {
      // Commit already handled the preview lifecycle — nothing to do.
      didCommit.current = false;
      isOpen.current = false;
      committedRef.current = null;
      setCommittedValue(null);
      return;
    }
    if (!isOpen.current) return;
    isOpen.current = false;
    committedRef.current = null;
    setCommittedValue(null);
    editor.doc.previewDiscard();
  }, [editor]);

  return { committedValue, onOpen, onSeek, onCommit, onClose };
}

/**
 * Async variant of {@link usePropertyPreview} for properties whose apply
 * function is asynchronous (e.g. font-family, which must load font files
 * before the canvas can render them).
 *
 * Differences from the sync version:
 * - `apply` returns `Promise<void>` (or void).
 * - `onSeek` awaits the apply before calling `previewSet()`.
 * - A monotonic seek counter ensures that a slow load that resolves after
 *   the user has already moved to another item is silently discarded.
 *
 * @param label — history label for the preview session
 * @param apply — async function that loads + dispatches a value to the store
 */
export function useAsyncPropertyPreview<T>(
  label: string,
  apply: (value: T) => Promise<void> | void
) {
  const editor = useCurrentEditor();
  const isOpen = useRef(false);
  const committedRef = useRef<T | null>(null);
  const [committedValue, setCommittedValue] = useState<T | null>(null);
  const seekGen = useRef(0);
  const didCommit = useRef(false);

  const onOpen = useCallback(
    (currentValue: T) => {
      if (isOpen.current) return;
      isOpen.current = true;
      didCommit.current = false;
      committedRef.current = currentValue;
      setCommittedValue(currentValue);
      seekGen.current++;
      editor.doc.previewStart(label);
    },
    [editor, label]
  );

  const onSeek = useCallback(
    (value: T | null | undefined) => {
      if (!isOpen.current) return;
      const gen = ++seekGen.current;
      const target = value != null ? value : committedRef.current;
      if (target == null) return;

      const result = apply(target);
      if (result && typeof (result as Promise<void>).then === "function") {
        (result as Promise<void>).then(() => {
          // Only capture if this is still the latest seek
          if (gen === seekGen.current && isOpen.current) {
            editor.doc.previewSet();
          }
        });
      } else {
        editor.doc.previewSet();
      }
    },
    [editor, apply]
  );

  const onCommit = useCallback(
    (value?: T) => {
      if (!isOpen.current && !editor.doc.isPreviewActive) return;
      isOpen.current = false;
      didCommit.current = true;
      committedRef.current = null;
      setCommittedValue(null);
      const gen = ++seekGen.current;

      if (value != null) {
        const result = apply(value);
        if (result && typeof (result as Promise<void>).then === "function") {
          (result as Promise<void>).then(() => {
            if (gen === seekGen.current) {
              editor.doc.previewSet();
              editor.doc.previewCommit();
            }
          });
        } else {
          editor.doc.previewSet();
          editor.doc.previewCommit();
        }
      } else {
        editor.doc.previewSet();
        editor.doc.previewCommit();
      }
    },
    [editor, apply]
  );

  const onClose = useCallback(() => {
    if (didCommit.current) {
      didCommit.current = false;
      isOpen.current = false;
      committedRef.current = null;
      setCommittedValue(null);
      return;
    }
    if (!isOpen.current) return;
    isOpen.current = false;
    committedRef.current = null;
    setCommittedValue(null);
    seekGen.current++;
    editor.doc.previewDiscard();
  }, [editor]);

  return { committedValue, onOpen, onSeek, onCommit, onClose };
}
