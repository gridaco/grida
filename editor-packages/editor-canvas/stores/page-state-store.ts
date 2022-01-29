import type { CanvasTransform } from "../types";

/**
 * page state store
 * - last selected node on this page
 * - last transform of canvas for this page
 *
 * (uses session storage)
 */
export class CanvasStateStore {
  constructor(readonly filekey: string, readonly pageid: string) {}

  saveLastSelection(...nodes: string[]) {
    sessionStorage.setItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-selection`,
      nodes ? JSON.stringify(nodes) : null
    );
  }

  getLastSelection(): string[] | null {
    const pl = sessionStorage.getItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-selection`
    );
    if (!pl) return null;
    return JSON.parse(pl);
  }

  saveLastTransform(transform: CanvasTransform) {
    sessionStorage.setItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-transform`,
      JSON.stringify(transform)
    );
  }

  getLastTransform(): CanvasTransform | null {
    const str = sessionStorage.getItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-transform`
    );
    if (!str) return null;
    return JSON.parse(str);
  }
}
