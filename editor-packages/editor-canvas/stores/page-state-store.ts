import type { CanvasTransform } from "../types";

/**
 * page state store
 * - last selected node on this page
 * - last transform of canvas for this page
 *
 * (uses session storage)
 */
export class PageStateStore {
  constructor(readonly filekey: string, readonly pageid: string) {}

  saveLastSelection(nodeid: string) {
    sessionStorage.setItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-selection`,
      nodeid
    );
  }

  getLastSelection(): string | null {
    return sessionStorage.getItem(
      `canvas-page-state-store/${this.filekey}/${this.pageid}/last-selection`
    );
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
