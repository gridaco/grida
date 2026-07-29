import type {
  LibraryExplorerItem,
  LibraryExplorerScroll,
} from "./library-explorer";

export type MasonryScrollPositioner = Readonly<{
  get(index: number): Readonly<{ top: number }> | undefined;
  range(
    lo: number,
    hi: number,
    callback: (index: number, left: number, top: number) => void
  ): void;
}>;

/**
 * Captures and resolves a masonry viewport without depending on the DOM or
 * React. The raw position is the fallback; an item anchor keeps restoration
 * stable when responsive columns move the same cached feed.
 */
export namespace MasonryScroll {
  export function capture(
    items: LibraryExplorerItem[],
    positioner: MasonryScrollPositioner,
    scrollTop: number,
    gridOffsetTop: number,
    viewportHeight: number
  ): LibraryExplorerScroll {
    const localTop = Math.max(0, scrollTop - gridOffsetTop);
    let anchor:
      | Readonly<{ id: string; top: number; distance: number }>
      | undefined;

    positioner.range(
      localTop,
      localTop + Math.max(1, viewportHeight),
      (index, _left, top) => {
        const item = items[index];
        if (!item) return;
        const distance = Math.abs(top - localTop);
        if (!anchor || distance < anchor.distance) {
          anchor = { id: item.id, top, distance };
        }
      }
    );

    return {
      scrollTop,
      anchorId: anchor?.id ?? null,
      anchorOffset: anchor ? gridOffsetTop + anchor.top - scrollTop : 0,
    };
  }

  export function resolve(
    items: LibraryExplorerItem[],
    positioner: MasonryScrollPositioner,
    snapshot: LibraryExplorerScroll,
    gridOffsetTop: number
  ): number {
    if (snapshot.anchorId === null) return snapshot.scrollTop;
    const index = items.findIndex((item) => item.id === snapshot.anchorId);
    if (index < 0) return snapshot.scrollTop;
    const position = positioner.get(index);
    if (!position) return snapshot.scrollTop;
    return Math.max(0, gridOffsetTop + position.top - snapshot.anchorOffset);
  }
}
