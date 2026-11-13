/**
 * Persistence port for one `.canvas` bundle: a flat set of text files
 * addressed by leading-slash paths (`/.canvas.json`, `/<id>.svg`).
 *
 * Backends are pure I/O — no caching or debouncing. Errors are thrown; the
 * store logs them and keeps its in-memory state.
 */
export interface BundleBackend {
  /** Enumerate every persisted path. Order undefined. */
  list(): Promise<string[]>;
  /** Read the text at `path`, or `null` when no such file exists. */
  read(path: string): Promise<string | null>;
  /** Write `content` to `path`, overwriting any prior content. */
  write(path: string, content: string): Promise<void>;
  /** Remove the file at `path`. No-op when the file doesn't exist. */
  delete(path: string): Promise<void>;
}

/** In-memory bundle — used where OPFS is unavailable, and in tests. */
export class MemoryBackend implements BundleBackend {
  private readonly files = new Map<string, string>();

  async list(): Promise<string[]> {
    return [...this.files.keys()];
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path);
  }
}
