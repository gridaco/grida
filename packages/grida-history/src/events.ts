// ---------------------------------------------------------------------------
// Minimal typed event emitter — zero dependencies
// ---------------------------------------------------------------------------

import type { Disposable } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fn = (...args: any[]) => void;

export class EventEmitter<Events extends Record<string, Fn>> {
  private listeners = new Map<keyof Events, Set<Fn>>();

  on<K extends keyof Events>(event: K, handler: Events[K]): Disposable {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Fn);
    return {
      dispose: () => {
        set!.delete(handler as Fn);
      },
    };
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      // Snapshot to avoid issues if a handler adds/removes listeners during emit
      for (const handler of [...set]) {
        handler(...args);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
