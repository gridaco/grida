/**
 * GRIDA-SEC-004 — durable, host-rooted binary media storage.
 *
 * The host supplies the dedicated root. The store never chooses a workspace,
 * project directory, Electron profile directory, or other user-visible path.
 * Entries are addressed by opaque UUIDs; renderer-safe records contain no
 * native path. Native path resolution is deliberately available only from the
 * Node-only `@grida/daemon/server` surface.
 *
 * An entry becomes visible only after both its bytes and metadata have landed:
 * bytes are atomically written first, then `item.json` is atomically published
 * as the commit marker. Listing ignores incomplete or corrupt entry folders so
 * one damaged item cannot make the rest of the library unavailable.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { constants as fsConstants, type Dirent, type Stats } from "node:fs";
import path from "node:path";
import type {
  MediaItem,
  MediaListOptions,
  MediaReadResult,
  MediaSaveInput,
} from "./protocol/resources";
import { containsPath } from "./path-contains";
import { atomicWrite } from "./storage/atomic-write";

type StoredMediaItem = MediaItem & { version: 1 };

type ResolvedMediaItem = {
  item: MediaItem;
  native_path: string;
};

/**
 * Path-free persistence capability supplied to daemon tenants.
 *
 * Listing, reading, and native-path resolution remain host operations on
 * {@link MediaStore}; a tenant can only publish complete bounded bytes and
 * receive their opaque descriptor.
 */
export interface MediaPersistence {
  save(input: MediaSaveInput): Promise<MediaItem>;
}

const ITEMS_DIRECTORY = "items";
const CONTENT_DIRECTORY = "content";
const METADATA_FILE = "item.json";
const METADATA_MAX_BYTES = 16 * 1024;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

export class MediaStore implements MediaPersistence {
  /**
   * One stored binary is capped before any filesystem mutation. This matches
   * the daemon's role as a bounded local capability while leaving room for
   * common 3D, audio, image, and video assets.
   */
  static readonly MAX_BYTES = 64 * 1024 * 1024;

  /** Maximum number of committed, valid items admitted by one store root. */
  static readonly MAX_ITEMS = 512;

  /** Maximum logical byte size of all committed, valid items. */
  static readonly MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;

  private readonly root: string;
  private readonly items_root: string;
  private save_tail: Promise<void> = Promise.resolve();

  constructor(root: string) {
    if (typeof root !== "string" || root.trim().length === 0) {
      throw new TypeError("media-root-required");
    }
    this.root = path.resolve(root);
    this.items_root = path.join(this.root, ITEMS_DIRECTORY);
  }

  /**
   * Save one complete binary. The returned item is the durable, path-free
   * record; callers do not need to list again after a successful save.
   */
  save(input: MediaSaveInput): Promise<MediaItem> {
    return this.serializeSave(() => this.saveExclusive(input));
  }

  private async saveExclusive(input: MediaSaveInput): Promise<MediaItem> {
    const fileName = validateFileName(input.file_name);
    const mediaType = validateMediaType(input.media_type);
    if (!(input.bytes instanceof Uint8Array)) {
      throw new TypeError("media-bytes-required");
    }
    if (input.bytes.byteLength === 0) {
      throw new RangeError("media-empty");
    }
    if (input.bytes.byteLength > MediaStore.MAX_BYTES) {
      throw new RangeError("media-too-large");
    }

    const realItemsRoot = await this.ensureLayout();
    const committed = await this.scanValidItems(realItemsRoot);
    if (committed.length >= MediaStore.MAX_ITEMS) {
      throw new RangeError("media-item-limit-reached");
    }
    const committedBytes = committed.reduce(
      (total, item) => total + item.byte_size,
      0
    );
    if (input.bytes.byteLength > MediaStore.MAX_TOTAL_BYTES - committedBytes) {
      throw new RangeError("media-total-bytes-limit-reached");
    }

    const id = await this.mintEntryDirectory(realItemsRoot);
    const entryDirectory = path.join(realItemsRoot, id);

    try {
      const contentDirectory = path.join(entryDirectory, CONTENT_DIRECTORY);
      await fs.mkdir(contentDirectory, { mode: 0o700 });
      const realContentDirectory = await fs.realpath(contentDirectory);
      if (
        !containsPath(realItemsRoot, realContentDirectory) ||
        realContentDirectory === realItemsRoot
      ) {
        throw new Error("media-path-escapes-root");
      }

      const nativePath = path.join(realContentDirectory, fileName);
      await atomicWrite(nativePath, input.bytes, { mode: 0o600 });

      const item: MediaItem = {
        id,
        file_name: fileName,
        media_type: mediaType,
        byte_size: input.bytes.byteLength,
        created_at: Date.now(),
      };
      const stored: StoredMediaItem = { version: 1, ...item };
      // Metadata is the commit marker and therefore always lands last.
      await atomicWrite(
        path.join(entryDirectory, METADATA_FILE),
        JSON.stringify(stored),
        { mode: 0o600 }
      );
      return item;
    } catch (error) {
      // This UUID directory was minted by this invocation and is still
      // uncommitted when an error escapes, so removing it cannot touch a
      // previously published item.
      await fs
        .rm(entryDirectory, { recursive: true, force: true })
        .catch(() => {});
      throw error;
    }
  }

  /**
   * List valid entries newest first. `limit` bounds only this returned view;
   * it never deletes or rewrites stored items.
   */
  async list(options: MediaListOptions = {}): Promise<MediaItem[]> {
    const limit = validateLimit(options.limit);
    const realItemsRoot = await this.ensureLayout();
    if (limit === 0) return [];
    const items = await this.scanValidItems(realItemsRoot);

    items.sort(
      (a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id)
    );
    return limit === undefined ? items : items.slice(0, limit);
  }

  private serializeSave<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.save_tail.then(operation, operation);
    this.save_tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async scanValidItems(realItemsRoot: string): Promise<MediaItem[]> {
    const entries = await fs.readdir(realItemsRoot, { withFileTypes: true });
    const items: MediaItem[] = [];

    for (const entry of entries) {
      if (!isCandidateEntry(entry)) continue;
      try {
        items.push((await this.resolveItem(entry.name, realItemsRoot)).item);
      } catch {
        // An incomplete/corrupt entry is unavailable, not library-wide
        // failure. Do not mutate it: recovery or inspection remains possible.
      }
    }
    return items;
  }

  /** Read exact bytes plus the same path-free descriptor returned by list. */
  async read(id: string): Promise<MediaReadResult> {
    assertId(id);
    const realItemsRoot = await this.ensureLayout();
    const resolved = await this.resolveItem(id, realItemsRoot);
    const handle = await openRegularFile(
      resolved.native_path,
      MediaStore.MAX_BYTES
    ).catch(() => {
      throw new Error("media-item-corrupt");
    });
    try {
      const stat = await handle.stat();
      if (stat.size !== resolved.item.byte_size) {
        throw new Error("media-item-corrupt");
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength !== resolved.item.byte_size) {
        throw new Error("media-item-corrupt");
      }
      return { item: resolved.item, bytes: new Uint8Array(bytes) };
    } finally {
      await handle.close();
    }
  }

  /**
   * Resolve an item for a trusted native host operation such as reveal-in-file-
   * manager. This method is Node-only and is not part of any daemon transport
   * or renderer-visible DTO.
   */
  async resolvePath(id: string): Promise<string> {
    assertId(id);
    const realItemsRoot = await this.ensureLayout();
    return (await this.resolveItem(id, realItemsRoot)).native_path;
  }

  private async ensureLayout(): Promise<string> {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const rootStat = await fs.lstat(this.root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      throw new Error("media-root-invalid");
    }

    await fs.mkdir(this.items_root, { recursive: true, mode: 0o700 });

    const itemsStat = await fs.lstat(this.items_root);
    if (itemsStat.isSymbolicLink() || !itemsStat.isDirectory()) {
      throw new Error("media-root-invalid");
    }

    const [realRoot, realItemsRoot] = await Promise.all([
      fs.realpath(this.root),
      fs.realpath(this.items_root),
    ]);
    if (!containsPath(realRoot, realItemsRoot) || realItemsRoot === realRoot) {
      throw new Error("media-root-invalid");
    }
    return realItemsRoot;
  }

  private async mintEntryDirectory(realItemsRoot: string): Promise<string> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = crypto.randomUUID();
      try {
        await fs.mkdir(path.join(realItemsRoot, id), { mode: 0o700 });
        return id;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    throw new Error("media-id-collision");
  }

  private async resolveItem(
    id: string,
    realItemsRoot: string
  ): Promise<ResolvedMediaItem> {
    assertId(id);
    const itemsStat = await fs.lstat(realItemsRoot).catch(() => {
      throw new Error("media-item-not-found");
    });
    if (itemsStat.isSymbolicLink() || !itemsStat.isDirectory()) {
      throw new Error("media-root-invalid");
    }
    const entryDirectory = path.join(realItemsRoot, id);
    const entryStat = await fs.lstat(entryDirectory).catch(() => {
      throw new Error("media-item-not-found");
    });
    if (entryStat.isSymbolicLink() || !entryStat.isDirectory()) {
      throw new Error("media-item-corrupt");
    }

    const realEntryDirectory = await fs.realpath(entryDirectory);
    if (
      !containsPath(realItemsRoot, realEntryDirectory) ||
      realEntryDirectory === realItemsRoot
    ) {
      throw new Error("media-item-corrupt");
    }

    const metadataHandle = await openRegularFile(
      path.join(realEntryDirectory, METADATA_FILE),
      METADATA_MAX_BYTES
    ).catch(() => {
      throw new Error("media-item-corrupt");
    });
    let raw: string;
    try {
      raw = await metadataHandle.readFile("utf8");
    } finally {
      await metadataHandle.close();
    }
    const item = parseStoredItem(raw, id);

    const contentDirectory = path.join(realEntryDirectory, CONTENT_DIRECTORY);
    const contentStat = await fs.lstat(contentDirectory).catch(() => {
      throw new Error("media-item-corrupt");
    });
    if (contentStat.isSymbolicLink() || !contentStat.isDirectory()) {
      throw new Error("media-item-corrupt");
    }
    const realContentDirectory = await fs.realpath(contentDirectory);
    if (
      !containsPath(realEntryDirectory, realContentDirectory) ||
      realContentDirectory === realEntryDirectory
    ) {
      throw new Error("media-item-corrupt");
    }

    const candidatePath = path.join(realContentDirectory, item.file_name);
    const candidateStat = await fs.lstat(candidatePath).catch(() => {
      throw new Error("media-item-corrupt");
    });
    if (candidateStat.isSymbolicLink() || !candidateStat.isFile()) {
      throw new Error("media-item-corrupt");
    }
    const nativePath = await fs.realpath(candidatePath);
    if (
      !containsPath(realContentDirectory, nativePath) ||
      nativePath === realContentDirectory
    ) {
      throw new Error("media-item-corrupt");
    }
    if (
      candidateStat.size !== item.byte_size ||
      candidateStat.size > MediaStore.MAX_BYTES
    ) {
      throw new Error("media-item-corrupt");
    }

    return { item, native_path: nativePath };
  }
}

function isCandidateEntry(entry: Dirent): boolean {
  return entry.isDirectory() && UUID_V4.test(entry.name);
}

function assertId(id: string): void {
  if (typeof id !== "string" || !UUID_V4.test(id)) {
    throw new TypeError("media-id-invalid");
  }
}

function validateLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new RangeError("media-limit-invalid");
  }
  return limit;
}

function validateFileName(fileName: string): string {
  if (
    typeof fileName !== "string" ||
    fileName.length === 0 ||
    Buffer.byteLength(fileName, "utf8") > 255 ||
    fileName === "." ||
    fileName === ".." ||
    hasForbiddenFileNameCharacter(fileName) ||
    /[. ]$/.test(fileName) ||
    WINDOWS_RESERVED_NAME.test(fileName) ||
    path.posix.basename(fileName) !== fileName ||
    path.win32.basename(fileName) !== fileName
  ) {
    throw new TypeError("media-file-name-invalid");
  }
  return fileName;
}

function hasForbiddenFileNameCharacter(fileName: string): boolean {
  for (const character of fileName) {
    const codePoint = character.codePointAt(0)!;
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      '<>:"/\\|?*'.includes(character)
    ) {
      return true;
    }
  }
  return false;
}

function validateMediaType(mediaType: string): string {
  if (
    typeof mediaType !== "string" ||
    mediaType.length > 255 ||
    !MIME_TYPE.test(mediaType)
  ) {
    throw new TypeError("media-type-invalid");
  }
  return mediaType.toLowerCase();
}

function parseStoredItem(raw: string, expectedId: string): MediaItem {
  try {
    const value = JSON.parse(raw) as Partial<StoredMediaItem>;
    if (
      value === null ||
      typeof value !== "object" ||
      value.version !== 1 ||
      value.id !== expectedId ||
      !Number.isSafeInteger(value.byte_size) ||
      value.byte_size! <= 0 ||
      value.byte_size! > MediaStore.MAX_BYTES ||
      !Number.isSafeInteger(value.created_at) ||
      value.created_at! < 0
    ) {
      throw new Error("invalid-record");
    }
    return {
      id: expectedId,
      file_name: validateFileName(value.file_name as string),
      media_type: validateMediaType(value.media_type as string),
      byte_size: value.byte_size!,
      created_at: value.created_at!,
    };
  } catch {
    throw new Error("media-item-corrupt");
  }
}

async function openRegularFile(filePath: string, maxBytes: number) {
  const handle = await fs.open(
    filePath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0)
  );
  try {
    const stat: Stats = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) {
      throw new Error("not-a-bounded-regular-file");
    }
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}
