// move
// resize

// width
// height
// x
// y
// rotation

abstract class DraftingStore<T> {
  readonly store = new Map<string, T>();

  abstract update(id: string, draft: T);

  abstract get(id: string): T;
}

interface Transform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

class TransformDraftingStore extends DraftingStore<Transform> {
  constructor(draftingStore: DraftingStore<Transform>) {
    super();
  }

  update(id: string, transform: Transform) {
    this.store.set(id, transform);
  }

  get(id: string): Transform {
    return this.store.get(id);
  }
}

// const store = new TransformDraftingStore();
// export function
