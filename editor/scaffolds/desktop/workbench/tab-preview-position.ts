/**
 * Fixed-viewport placement for the workspace tab preview.
 *
 * The preview is intentionally noninteractive and has one active anchor, so it
 * only needs the small collision policy below rather than menu positioning and
 * focus machinery.
 */
export namespace TabPreviewPosition {
  export type Rect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };

  export type Size = {
    width: number;
    height: number;
  };

  export type Point = {
    left: number;
    top: number;
  };

  export function visibleAnchor(anchor: Rect, clip: Rect): Rect | null {
    const left = Math.max(anchor.left, clip.left);
    const top = Math.max(anchor.top, clip.top);
    const right = Math.min(anchor.right, clip.right);
    const bottom = Math.min(anchor.bottom, clip.bottom);
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  }

  export function place({
    anchor,
    popup,
    viewport,
    offset = 6,
    padding = 12,
  }: {
    anchor: Rect;
    popup: Size;
    viewport: Size;
    offset?: number;
    padding?: number;
  }): Point {
    const maxLeft = Math.max(padding, viewport.width - padding - popup.width);
    const maxTop = Math.max(padding, viewport.height - padding - popup.height);
    const below = anchor.bottom + offset;
    const above = anchor.top - popup.height - offset;
    const preferredTop =
      below + popup.height <= viewport.height - padding || above < padding
        ? below
        : above;

    return {
      left: clamp(anchor.left, padding, maxLeft),
      top: clamp(preferredTop, padding, maxTop),
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }
}
