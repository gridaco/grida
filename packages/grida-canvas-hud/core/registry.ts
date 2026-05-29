// Generic name-keyed registry.
//
// Bedrock — no knowledge of HUDObject, participants, or any class
// taxonomy. The deferred orchestrator + classes/ layer use this to
// hold whatever entity has a stable `name` and an optional `detach`
// lifecycle hook.
//
// One entity per name. Insertion-ordered (Map iteration order +
// explicit array for cheap reverse-walk on `clear`). Lifecycle hooks
// (`detach`) called on `unregister` + `clear`.

/**
 * Thrown by `register` when an entity with the same `name` is already
 * registered. Consumers should `unregister` the existing one first.
 */
export class RegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistrationError";
  }
}

/**
 * Generic name-keyed registry.
 *
 * @typeParam K — key type, must extend `string`.
 * @typeParam T — entity type. Must expose `readonly name: K` and an
 *               optional `detach()` method.
 */
export class NamedRegistry<
  K extends string,
  T extends { readonly name: K; detach?(): void },
> {
  private byName = new Map<K, T>();
  /** Explicit insertion-ordered array for cheap reverse-walk on clear. */
  private order: T[] = [];

  constructor(private label: string) {}

  register(e: T): void {
    if (this.byName.has(e.name)) {
      throw new RegistrationError(
        `${this.label} "${e.name}" already registered; unregister it first.`
      );
    }
    this.byName.set(e.name, e);
    this.order.push(e);
  }

  unregister(e: T): void {
    const existing = this.byName.get(e.name);
    if (existing !== e) return;
    this.byName.delete(e.name);
    const i = this.order.indexOf(e);
    if (i >= 0) this.order.splice(i, 1);
    try {
      e.detach?.();
    } catch (err) {
      console.error(`[hud] ${this.label} "${e.name}" detach() threw:`, err);
    }
  }

  has(name: K): boolean {
    return this.byName.has(name);
  }

  get(name: K): T | undefined {
    return this.byName.get(name);
  }

  *entries(): IterableIterator<T> {
    for (const e of this.order) yield e;
  }

  size(): number {
    return this.order.length;
  }

  clear(): void {
    for (let i = this.order.length - 1; i >= 0; i--) {
      const e = this.order[i];
      try {
        e.detach?.();
      } catch (err) {
        console.error(`[hud] ${this.label} "${e.name}" detach() threw:`, err);
      }
    }
    this.order = [];
    this.byName.clear();
  }
}
