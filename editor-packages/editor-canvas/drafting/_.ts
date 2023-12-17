export abstract class DraftingStore<T> {
  readonly store = new Map<string, T>();
  lastUpdated: number;

  constructor() {
    this.lastUpdated = Date.now();
  }

  abstract update(id: string, draft: T);

  abstract get(id: string): T;

  updated() {
    this.lastUpdated = Date.now();
  }
}
