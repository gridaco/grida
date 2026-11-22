import { WebPreview } from "@grida/desktop-bridge";

/** Shares the current presentation for each page in a workspace attachment. */
export namespace PagePreviews {
  export type Lookup = (
    url: string,
    signal: AbortSignal
  ) => Promise<WebPreview.Result | null>;

  export type Snapshot = Readonly<{
    metadata: WebPreview.Metadata | null;
    loading: boolean;
  }>;

  export type Source = Readonly<{
    getSnapshot(): Snapshot;
    subscribe(listener: () => void): () => void;
    /** Requests a check and returns a release for this consumer's interest. */
    request(): () => void;
  }>;

  export const empty: Snapshot = Object.freeze({
    metadata: null,
    loading: false,
  });

  type Pending = { abort: AbortController; readers: number };
  type Entry = {
    snapshot: Snapshot;
    listeners: Set<() => void>;
    pending?: Pending;
  };

  export class Controller {
    private readonly entries = new Map<string, Entry>();

    constructor(private readonly lookup: Lookup) {}

    forUrl(href: string): Source | null {
      const url =
        WebPreview.normalizePublicUrl(href) ?? WebPreview.normalizeUrl(href);
      if (!url) return null;
      const key = url.split("#", 1)[0];
      return {
        getSnapshot: () => this.entries.get(key)?.snapshot ?? empty,
        subscribe: (listener) => {
          const entry = this.entry(key);
          entry.listeners.add(listener);
          return () => {
            entry.listeners.delete(listener);
            this.releaseEntry(key, entry);
          };
        },
        request: () => this.request(key),
      };
    }

    clear(): void {
      for (const [url, entry] of this.entries) {
        const pending = entry.pending;
        entry.pending = undefined;
        pending?.abort.abort();
        this.publish(entry, empty);
        this.releaseEntry(url, entry);
      }
    }

    private entry(url: string): Entry {
      let entry = this.entries.get(url);
      if (!entry) {
        entry = { snapshot: empty, listeners: new Set() };
        this.entries.set(url, entry);
      }
      return entry;
    }

    private request(url: string): () => void {
      const entry = this.entry(url);
      const pending = entry.pending ?? this.start(url, entry);
      pending.readers++;
      let interested = true;
      return () => {
        if (!interested) return;
        interested = false;
        if (--pending.readers === 0 && entry.pending === pending) {
          pending.abort.abort();
          this.settle(url, entry, pending, null);
        }
      };
    }

    private start(url: string, entry: Entry): Pending {
      const pending = { abort: new AbortController(), readers: 0 };
      entry.pending = pending;
      this.publish(entry, { metadata: entry.snapshot.metadata, loading: true });
      const signal = pending.abort.signal;
      void Promise.resolve()
        .then(() => (signal.aborted ? null : this.lookup(url, signal)))
        .catch(() => null)
        .then((result) => this.settle(url, entry, pending, result));
      return pending;
    }

    private settle(
      url: string,
      entry: Entry,
      pending: Pending,
      result: WebPreview.Result | null
    ): void {
      if (entry.pending !== pending) return;
      entry.pending = undefined;
      this.publish(entry, {
        metadata: result ? result.metadata : entry.snapshot.metadata,
        loading: false,
      });
      this.releaseEntry(url, entry);
    }

    private publish(entry: Entry, next: Snapshot): void {
      if (
        entry.snapshot.metadata === next.metadata &&
        entry.snapshot.loading === next.loading
      )
        return;
      entry.snapshot = next;
      for (const listener of entry.listeners) listener();
    }

    private releaseEntry(url: string, entry: Entry): void {
      if (
        !entry.pending &&
        !entry.listeners.size &&
        this.entries.get(url) === entry
      )
        this.entries.delete(url);
    }
  }
}
