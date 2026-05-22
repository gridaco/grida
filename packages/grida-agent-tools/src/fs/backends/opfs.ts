import type { AgentFs } from "../index";

/**
 * Origin Private File System backend.
 *
 * `AgentFs` logical paths (`/canvas.svg`, `/notes/draft.md`) become OPFS
 * directory + file handles under a fixed root (`baseSegments`). Bumping
 * the trailing segment is the documented "clear all persisted data"
 * lever; old data orphans until the browser garbage-collects.
 *
 * FIXME(agent-fs-opfs): demo-grade. Before promoting beyond /svg:
 *   - Real migration story (read old → transform → write new → delete).
 *   - Quarantine for unparseable bytes (mirror canvas playground).
 *   - Surface failures to the user instead of console.warn.
 */
export class OpfsBackend implements AgentFs.Backend {
  private root_promise: Promise<FileSystemDirectoryHandle> | null = null;

  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "storage" in navigator &&
      "getDirectory" in navigator.storage &&
      window.isSecureContext
    );
  }

  /**
   * @param baseSegments  Path segments under the origin's OPFS root. The
   * canonical demo uses `["grida-svg-demo", "v1"]`; bumping `v1` blows
   * the cache.
   */
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
      throw new Error(`agent-fs path must start with "/": ${p}`);
    }
    const segments = p.slice(1).split("/").filter(Boolean);
    if (segments.length === 0) {
      throw new Error(`agent-fs path must include a filename: ${p}`);
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
    const root = await this.getRoot();
    await walk(root, "", out);
    return out;
  }

  async read(p: string): Promise<string | null> {
    try {
      const { dir, name } = await this.resolveDir(p, false);
      const fh = await dir.getFileHandle(name);
      const f = await fh.getFile();
      return await f.text();
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
  // `values()` is async-iterable in spec-compliant browsers.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries = (dir as unknown as { values(): AsyncIterable<any> }).values();
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
