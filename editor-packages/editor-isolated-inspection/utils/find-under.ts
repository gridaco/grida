import type { DesignRepository } from "editor/core/states";

/**
 * This only supports root frame at the moment.
 * partof: nodeQ
 * @param node
 * @param design
 * @returns
 */
export function findUnder(node: string, design: DesignRepository) {
  for (const page of design.pages) {
    for (const frame of page.children.filter(Boolean)) {
      if (frame.id === node) {
        return frame;
      }
    }
  }
}

export function findShifted(node: string, design: DesignRepository, shift = 0) {
  for (const page of design.pages) {
    for (let i = 0; i < page.children.filter(Boolean).length; i++) {
      const frame = page.children[i];
      if (frame.id === node) {
        return page.children[i + shift];
      }
    }
  }
}
