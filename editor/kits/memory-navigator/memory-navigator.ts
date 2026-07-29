export type MemoryNavigatorEntry<Route, State> = Readonly<{
  route: Route;
  state: State;
}>;

export type MemoryNavigatorSnapshot<Route, State> = Readonly<{
  current: MemoryNavigatorEntry<Route, State>;
  canGoBack: boolean;
}>;

type Listener = () => void;

/**
 * A small, in-memory navigation stack for scoped experiences.
 *
 * Routes and entry state are opaque to the navigator. Hosts decide what they
 * mean, how they render, and when the navigator's lifetime ends.
 */
export class MemoryNavigator<Route, State = undefined> {
  private readonly entries: MemoryNavigatorEntry<Route, State>[];
  private readonly listeners = new Set<Listener>();
  private snapshot: MemoryNavigatorSnapshot<Route, State>;
  private updatingState = false;

  constructor(initial: MemoryNavigatorEntry<Route, State>) {
    const entry = this.createEntry(initial);
    this.entries = [entry];
    this.snapshot = this.createSnapshot(entry);
  }

  get current(): MemoryNavigatorEntry<Route, State> {
    return this.snapshot.current;
  }

  get canGoBack(): boolean {
    return this.snapshot.canGoBack;
  }

  readonly getSnapshot = (): MemoryNavigatorSnapshot<Route, State> => {
    return this.snapshot;
  };

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  push(next: MemoryNavigatorEntry<Route, State>): void {
    this.assertNotUpdatingState();
    const entry = this.createEntry(next);
    this.entries.push(entry);
    this.publish(entry);
  }

  replace(next: MemoryNavigatorEntry<Route, State>): void {
    this.assertNotUpdatingState();
    const current = this.current;
    if (
      Object.is(current.route, next.route) &&
      Object.is(current.state, next.state)
    ) {
      return;
    }

    const entry = this.createEntry(next);
    this.entries[this.entries.length - 1] = entry;
    this.publish(entry);
  }

  back(): boolean {
    this.assertNotUpdatingState();
    if (!this.canGoBack) return false;

    this.entries.pop();
    this.publish(this.entries[this.entries.length - 1]);
    return true;
  }

  updateCurrentState(update: (current: State) => State): void {
    this.assertNotUpdatingState();
    const current = this.current;
    this.updatingState = true;
    let state: State;
    try {
      state = update(current.state);
    } finally {
      this.updatingState = false;
    }
    if (Object.is(current.state, state)) return;

    const entry = this.createEntry({ route: current.route, state });
    this.entries[this.entries.length - 1] = entry;
    this.publish(entry);
  }

  private createEntry(
    entry: MemoryNavigatorEntry<Route, State>
  ): MemoryNavigatorEntry<Route, State> {
    return Object.freeze({
      route: entry.route,
      state: entry.state,
    });
  }

  private createSnapshot(
    current: MemoryNavigatorEntry<Route, State>
  ): MemoryNavigatorSnapshot<Route, State> {
    return Object.freeze({
      current,
      canGoBack: this.entries.length > 1,
    });
  }

  private publish(current: MemoryNavigatorEntry<Route, State>): void {
    this.snapshot = this.createSnapshot(current);
    const listeners = Array.from(this.listeners);
    for (const listener of listeners) {
      try {
        listener();
      } catch (error) {
        // A subscriber observes an already-committed mutation. Keep delivery
        // complete and make the observer failure visible without pretending
        // that the navigation itself failed.
        console.error("[MemoryNavigator] subscriber failed", error);
      }
    }
  }

  private assertNotUpdatingState(): void {
    if (this.updatingState) {
      throw new Error("MemoryNavigator cannot navigate from a state updater.");
    }
  }
}
