/** GRIDA-SEC-016 — bounded Main-owned history, never renderer-authored visits. */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { atomicWrite } from "@grida/daemon/server";
import { DesktopBrowser } from "@grida/desktop-bridge";

type Entry = DesktopBrowser.History.Entry;
type Update =
  | { kind: "visit"; entry: Entry; token: symbol; epoch: number }
  | { kind: "title"; title: string; token: symbol; epoch: number };

/** One global local history; mutations and atomic publication share one queue. */
export class BrowserHistory {
  static readonly MAX_ENTRIES = 500;
  static readonly MAX_FILE_BYTES = 2 * 1024 * 1024;
  readonly #listeners = new Set<
    (change: DesktopBrowser.History.Change) => void
  >();
  readonly #tokens = new Map<string, symbol>();
  #entries: Map<string, Entry>;
  #pending = new Map<string, Update>();
  #tail: Promise<void> = Promise.resolve();
  #scheduled = false;
  #revision = 0;
  #epoch = 0;
  #serialized: string;
  readonly #filePath: string;

  private constructor(filePath: string, entries: readonly Entry[]) {
    this.#filePath = filePath;
    const encoded = this.#encode(entries);
    this.#entries = encoded.entries;
    this.#serialized = encoded.content;
  }

  static async open(userDataPath: string): Promise<BrowserHistory> {
    await fs.mkdir(userDataPath, { recursive: true, mode: 0o700 });
    const filePath = path.join(userDataPath, "browser-history.json");
    const entries: Entry[] = [];
    let file: Awaited<ReturnType<typeof fs.open>> | undefined;
    try {
      const initial = await fs.lstat(filePath);
      if (
        !initial.isFile() ||
        initial.isSymbolicLink() ||
        initial.size > this.MAX_FILE_BYTES
      )
        return new BrowserHistory(filePath, []);
      file = await fs.open(
        filePath,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      );
      const info = await file.stat();
      if (!info.isFile() || info.size > this.MAX_FILE_BYTES)
        return new BrowserHistory(filePath, []);
      if (process.platform !== "win32") await file.chmod(0o600);
      const buffer = Buffer.alloc(this.MAX_FILE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const read = await file.read(
          buffer,
          length,
          buffer.length - length,
          null
        );
        if (!read.bytesRead) break;
        length += read.bytesRead;
      }
      if (length > this.MAX_FILE_BYTES) return new BrowserHistory(filePath, []);
      const data = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(
          buffer.subarray(0, length)
        )
      ) as unknown;
      if (!data || typeof data !== "object" || Array.isArray(data))
        return new BrowserHistory(filePath, []);
      const raw = data as Record<string, unknown>;
      if (
        Object.keys(raw).length !== 2 ||
        raw.schema_version !== 1 ||
        !Array.isArray(raw.entries) ||
        raw.entries.length > this.MAX_ENTRIES
      )
        return new BrowserHistory(filePath, []);
      const urls = new Set<string>();
      for (const value of raw.entries) {
        const entry = DesktopBrowser.History.parseEntry(value);
        if (!entry || urls.has(entry.url))
          return new BrowserHistory(filePath, []);
        urls.add(entry.url);
        entries.push(entry);
      }
    } catch {
      // A missing, corrupt or unreadable history never disables the browser.
      return new BrowserHistory(filePath, []);
    } finally {
      await file?.close();
    }
    return new BrowserHistory(filePath, entries);
  }

  subscribe(
    listener: (change: DesktopBrowser.History.Change) => void
  ): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  visit(url: string, title: string, lastVisitedAt = Date.now()): symbol | null {
    const entry = DesktopBrowser.History.parseEntry({
      url,
      title,
      lastVisitedAt,
    });
    if (!entry) return null;
    const token = Symbol();
    this.#tokens.set(url, token);
    while (this.#tokens.size > BrowserHistory.MAX_ENTRIES * 2)
      this.#tokens.delete(this.#tokens.keys().next().value!);
    this.#put(url, { kind: "visit", entry, token, epoch: this.#epoch });
    return token;
  }

  /** A title can refine its existing visit, never recreate a removed URL. */
  updateTitle(url: string, title: string, token: symbol): void {
    if (
      this.#tokens.get(url) !== token ||
      !DesktopBrowser.History.parseEntry({ url, title, lastVisitedAt: 0 })
    )
      return;
    const pending = this.#pending.get(url);
    this.#put(
      url,
      pending?.kind === "visit" && pending.token === token
        ? { ...pending, entry: { ...pending.entry, title } }
        : { kind: "title", title, token, epoch: this.#epoch }
    );
  }

  query(
    raw: unknown,
    check: () => void = () => {}
  ): Promise<DesktopBrowser.History.Snapshot> {
    const request = DesktopBrowser.History.parseQuery(raw);
    if (!request)
      return Promise.reject(new Error("browser_history_request_invalid"));
    return this.#enqueue(async () => {
      check();
      await this.#applyPending();
      check();
      const query = request.query.trim().toLowerCase();
      const entries = this.#sort(this.#entries.values())
        .filter(
          (entry) =>
            !query ||
            entry.url.toLowerCase().includes(query) ||
            entry.title.toLowerCase().includes(query)
        )
        .slice(0, request.limit);
      return {
        version: DesktopBrowser.History.VERSION,
        revision: this.#revision,
        entries,
      };
    });
  }

  remove(raw: unknown, check: () => void = () => {}): Promise<void> {
    const request = DesktopBrowser.History.parseRemoval(raw);
    if (!request)
      return Promise.reject(new Error("browser_history_request_invalid"));
    this.#tokens.delete(request.url);
    this.#pending.delete(request.url);
    return this.#enqueue(async () => {
      check();
      // Valid background visits do not depend on a removal caller remaining
      // admitted while their own staged write completes.
      await this.#applyPending();
      check();
      const next = new Map(this.#entries);
      next.delete(request.url);
      await this.#commit(next, check);
      check();
    });
  }

  clear(check: () => void = () => {}): Promise<void> {
    check();
    this.#epoch++;
    this.#pending.clear();
    this.#tokens.clear();
    return this.#enqueue(() => this.#commit(new Map(), check, true));
  }

  flush(): Promise<void> {
    return this.#enqueue(() => this.#applyPending());
  }

  #put(url: string, update: Update): void {
    this.#pending.set(url, update);
    while (this.#pending.size > BrowserHistory.MAX_ENTRIES)
      this.#pending.delete(this.#pending.keys().next().value!);
    if (this.#scheduled) return;
    this.#scheduled = true;
    void this.#enqueue(async () => {
      this.#scheduled = false;
      await this.#applyPending();
    }).catch(() => console.warn("[grida] browser history could not be saved"));
  }

  #takePending(): Map<string, Entry> {
    const updates = this.#pending;
    this.#pending = new Map();
    const next = new Map(this.#entries);
    for (const [url, update] of updates) {
      if (
        update.epoch !== this.#epoch ||
        this.#tokens.get(url) !== update.token
      )
        continue;
      if (update.kind === "visit") next.set(url, update.entry);
      else {
        const previous = next.get(url);
        if (previous) next.set(url, { ...previous, title: update.title });
      }
    }
    return next;
  }

  async #applyPending(): Promise<void> {
    if (this.#pending.size) await this.#commit(this.#takePending());
  }

  async #commit(
    next: Map<string, Entry>,
    check: () => void = () => {},
    force = false
  ): Promise<void> {
    const encoded = this.#encode(next.values());
    if (!force && encoded.content === this.#serialized) return;
    const epoch = this.#epoch;
    try {
      await atomicWrite(this.#filePath, encoded.content, {
        mode: 0o600,
        before_commit: async () => {
          check();
          try {
            const info = await fs.lstat(this.#filePath);
            if (!info.isFile() || info.isSymbolicLink())
              throw new Error("browser_history_file_invalid");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          check();
        },
      });
    } catch {
      throw new Error("browser_history_write_failed");
    }
    if (epoch !== this.#epoch) return;
    this.#entries = encoded.entries;
    this.#serialized = encoded.content;
    const change = { revision: ++this.#revision };
    for (const listener of this.#listeners) {
      try {
        listener(change);
      } catch {
        /* Best-effort invalidation; reads have their own revision. */
      }
    }
  }

  #encode(entries: Iterable<Entry>): {
    entries: Map<string, Entry>;
    content: string;
  } {
    const selected = new Map<string, Entry>();
    const parts: string[] = [];
    const prefix = '{"schema_version":1,"entries":[';
    const suffix = "]}\n";
    let size = Buffer.byteLength(prefix + suffix);
    for (const entry of this.#sort(entries).slice(
      0,
      BrowserHistory.MAX_ENTRIES
    )) {
      const part = JSON.stringify(entry);
      const bytes = Buffer.byteLength(part) + (parts.length ? 1 : 0);
      if (size + bytes > BrowserHistory.MAX_FILE_BYTES) break;
      size += bytes;
      parts.push(part);
      selected.set(entry.url, entry);
    }
    return { entries: selected, content: prefix + parts.join(",") + suffix };
  }

  #sort(entries: Iterable<Entry>): Entry[] {
    return [...entries].sort(
      (a, b) =>
        b.lastVisitedAt - a.lastVisitedAt ||
        (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)
    );
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation);
    this.#tail = result.then(
      () => {},
      () => {}
    );
    return result;
  }
}
