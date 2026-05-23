// Snap configuration.
//
// Editor-agnostic — this file MUST NOT import any document, DOM, or
// editor type. It is a candidate to extract to a shared snap package
// (see `./README.md`).

export type SnapOptions = {
  /** When false, snap behavior and snap-guide rendering are both off. */
  enabled: boolean;
  /** Snap threshold in HUD canvas pixels (container CSS px in svg-editor;
   *  whatever space the consumer feeds in). Constant across zoom because
   *  the input rects are already in screen-equivalent units. */
  threshold_px: number;
};

export const DEFAULT_SNAP_OPTIONS: SnapOptions = {
  enabled: true,
  threshold_px: 6,
};
