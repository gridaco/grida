/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type { BundleBackend } from "./backend";

/**
 * Origin Private File System backend for the SVG demo bundle.
 *
 * Logical paths (`/.canvas.json`, `/<id>.svg`) become OPFS directory + file
 * handles under a fixed root (`baseSegments`). Bumping the trailing segment
 * is the documented "clear all persisted data" lever; old data orphans until
 * the browser garbage-collects.
 *
 * FIXME(svg-demo-opfs): demo-grade. There is no migration story, no
 * quarantine for unparseable bytes, and failures surface only as
 * `console.warn` from the store.
 */
export class OpfsBackend implements BundleBackend {
  private root_promise: Promise<FileSystemDirectoryHandle> | null = null;

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "storage" in navigator &&
      "getDirectory" in navigator.storage &&
      window.isSecureContext
    );
  }

  /** @param baseSegments Path segments under the origin's OPFS root. */
  constructor(private readonly baseSegments: readonly string[]) {}

  private async getRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.root_promise) {
      this.root_promise = (async () => {
        const root = await navigator.storage.getDirectory();
        let cur = root;
        for (const seg of this.baseSegments) {
          cur = await cur.getDirectoryHandle(seg, { create: true });
        }
        return cur;
      })().catch((err) => {
        this.root_promise = null;
        throw err;
      });
    }
    return this.root_promise;
  }

  /**
   * Resolve a logical path to a directory handle + file name pair,
   * creating directories on demand when `create` is true.
   */
  private async resolveDir(
    p: string,
    create: boolean
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string }> {
    if (!p.startsWith("/")) {
      throw new Error(`bundle path must start with "/": ${p}`);
    }
    const segments = p.slice(1).split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error(`bundle path must include a filename: ${p}`);
    }
    const name = segments[segments.length - 1];
    let cur = await this.getRoot();
    for (let i = 0; i < segments.length - 1; i++) {
      cur = await cur.getDirectoryHandle(segments[i], { create });
    }
    return { dir: cur, name };
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    await walk(await this.getRoot(), "", out);
    return out;
  }

  async read(p: string): Promise<string | null> {
    try {
      const { dir, name } = await this.resolveDir(p, false);
      const fh = await dir.getFileHandle(name);
      return await (await fh.getFile()).text();
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async write(p: string, content: string): Promise<void> {
    const { dir, name } = await this.resolveDir(p, true);
    const fh = await dir.getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    try {
      await writable.write(content);
    } finally {
      await writable.close();
    }
  }

  async delete(p: string): Promise<void> {
    try {
      const { dir, name } = await this.resolveDir(p, false);
      await dir.removeEntry(name);
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}

async function walk(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: string[]
): Promise<void> {
  // `values()` is async-iterable in spec-compliant browsers — the typing
  // for it isn't in the default lib yet.
  const entries = (
    dir as unknown as { values(): AsyncIterable<FileSystemHandle> }
  ).values();
  for await (const entry of entries) {
    const path = `${prefix}/${entry.name}`;
    if (entry.kind === "directory") {
      await walk(entry as FileSystemDirectoryHandle, path, out);
    } else {
      out.push(path);
    }
  }
}

function isNotFound(err: unknown): boolean {
  return err instanceof DOMException && err.name === "NotFoundError";
}
