import type { XY } from "../types";
import { DraftingStore } from "./_";
// move
// resize

// width
// height
// x
// y
// rotation

interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export class TransformDraftingStore extends DraftingStore<Transform> {
  constructor(transforrms: (Transform & { id: string })[]) {
    super();

    transforrms.forEach((transform) => {
      this.store.set(transform.id, TransformDraftingStore.flat(transform));
    });
  }

  static flat(t: Transform): Transform {
    return {
      x: t.x,
      y: t.y,
      width: t.width,
      height: t.height,
      rotation: t.rotation,
    };
  }

  moveBy(delta: XY) {
    Object.keys(this.store).forEach((id) => {
      this.store[id].x += delta[0];
      this.store[id].y += delta[1];
    });
    this.updated();
  }

  update(id: string, transform: Transform) {
    this.store.set(id, TransformDraftingStore.flat(transform));
    this.updated();
  }

  get(id: string, fallback?: Transform): Transform {
    return this.store.get(id) ?? fallback;
  }
}

// export function
