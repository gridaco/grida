/**
 * GRIDA-SEC-004 — daemon-side file path registry.
 *
 * The agent host owns the path↔docId mapping. The client never sees an
 * absolute path; it talks to the agent host by `docId` only. This is what
 * makes the bridge's file surface honest: a compromised client
 * cannot ask the agent host to read `/etc/passwd` because it has no way
 * to express that — it has only opaque UUIDs handed out by the
 * register step, which is itself driven from a host-owned file-open
 * capability.
 *
 * Same path opened twice → same docId. We use a normalized-path
 * reverse map for this so a host re-open of a file the user already
 * has loaded resolves to the existing document id instead of spawning
 * duplicate state. Normalization tries `fs.realpathSync.native`
 * first (resolves symlinks + case-normalizes on case-insensitive FS),
 * falling back to `path.resolve` when the file doesn't exist yet
 * (a fresh host-created target before write).
 *
 * The registry is purely in-memory and per-launch — the client is
 * already responsible for its own document state, and any "user
 * recently opened these" persistence lives in `recent.ts`. The
 * registry having no persistence is intentional: a stale docId would
 * be worse than asking the user to reopen the file.
 *
 * No `dirty` field here — the client (the local editor) is the
 * authority on whether the document has unsaved changes. The agent host
 * just owns paths and atomic I/O.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type RegistryEntry = {
  /** Absolute filesystem path, normalized on first sight. */
  path: string;
  /** Last observed `mtimeMs` (epoch ms). 0 until the first read/write. */
  mtime: number;
};

type RegistryState = {
  by_doc_id: Map<string, RegistryEntry>;
  /** Reverse map: normalized path → docId. Lets the same path resolve to the same doc. */
  by_path: Map<string, string>;
};

/**
 * Normalize a path so two strings that point to the same file resolve
 * to the same key. We prefer `fs.realpathSync.native` because:
 *
 *   - On macOS (HFS+/APFS case-insensitive by default), it lowercases.
 *   - On any platform, it resolves symlinks — opening a symlink and
 *     its target should be one document, not two.
 *
 * `realpath` throws if the file doesn't exist (typical for a new
 * host-created file before the first write); in that case we fall back to
 * `path.resolve` which still gives us a canonical absolute form.
 */
function normalize(filePath: string): string {
  try {
    return fs.realpathSync.native(filePath);
  } catch {
    return path.resolve(filePath);
  }
}

export class FileRegistry {
  private state: RegistryState = {
    by_doc_id: new Map(),
    by_path: new Map(),
  };

  /**
   * Register a path. If the path is already known, returns the
   * existing docId (no duplicate entry). This is the property that
   * makes "open the same file twice" return the existing document id.
   */
  registerPath(filePath: string): string {
    const normalized = normalize(filePath);
    const existing = this.state.by_path.get(normalized);
    if (existing) return existing;
    const docId = crypto.randomUUID();
    this.state.by_doc_id.set(docId, { path: normalized, mtime: 0 });
    this.state.by_path.set(normalized, docId);
    return docId;
  }

  getEntry(docId: string): RegistryEntry | undefined {
    return this.state.by_doc_id.get(docId);
  }

  removeEntry(docId: string): void {
    const entry = this.state.by_doc_id.get(docId);
    if (!entry) return;
    this.state.by_doc_id.delete(docId);
    this.state.by_path.delete(entry.path);
  }

  /**
   * Internal — used by `io.ts` to keep the cached mtime fresh after a
   * read or write. Not part of the public surface; the client
   * doesn't get to set mtime.
   */
  _setMtime(docId: string, mtime: number): void {
    const entry = this.state.by_doc_id.get(docId);
    if (entry) entry.mtime = mtime;
  }
}
