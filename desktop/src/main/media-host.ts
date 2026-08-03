/**
 * GRIDA-SEC-004 — purpose-scoped native access to app-managed durable media.
 *
 * Renderer-facing methods exchange only opaque ids, path-free descriptors,
 * and bounded byte views. Native paths remain private to this main-process
 * class.
 */
import path from "node:path";
import type { MediaItem } from "@grida/daemon";
import { MediaStore } from "@grida/daemon/server";
import type { DesktopMediaReadResult } from "../bridge/contract";

const RECENT_MEDIA_LIMIT = 20;
const MAX_PENDING_MEDIA_READS = 2;

type DesktopMediaHostOptions = Readonly<{
  root: string;
  reveal: (nativePath: string) => Promise<void> | void;
  openFolder: (nativePath: string) => Promise<void> | void;
}>;

export class DesktopMediaHost {
  private readonly root: string;
  private readonly store: MediaStore;
  private readonly revealNativePath: DesktopMediaHostOptions["reveal"];
  private readonly openNativeFolder: DesktopMediaHostOptions["openFolder"];
  private readTail: Promise<void> = Promise.resolve();
  private pendingReads = 0;

  constructor(options: DesktopMediaHostOptions) {
    this.root = path.resolve(options.root);
    this.store = new MediaStore(this.root);
    this.revealNativePath = options.reveal;
    this.openNativeFolder = options.openFolder;
  }

  async list(): Promise<MediaItem[]> {
    return await this.guard(
      "media-list-failed",
      async () => await this.store.list({ limit: RECENT_MEDIA_LIMIT })
    );
  }

  read(id: string): Promise<DesktopMediaReadResult> {
    // Keep one active read plus one queued UI selection. This prevents rapid
    // Recent A → B navigation from falsely rejecting B while still bounding a
    // compromised renderer's queued whole-file work.
    if (this.pendingReads >= MAX_PENDING_MEDIA_READS) {
      return Promise.reject(new Error("media-read-failed"));
    }
    this.pendingReads += 1;
    const operation = this.readTail.then(() =>
      this.guard("media-read-failed", async () => {
        const result = await this.store.read(id);
        return {
          item: result.item,
          bytes: Uint8Array.from(result.bytes).buffer,
        };
      })
    );
    this.readTail = operation.then(
      () => undefined,
      () => undefined
    );
    return operation.finally(() => {
      this.pendingReads -= 1;
    });
  }

  async reveal(id: string): Promise<void> {
    await this.guard("media-reveal-failed", async () => {
      const nativePath = await this.store.resolvePath(id);
      await this.revealNativePath(nativePath);
    });
  }

  async openFolder(): Promise<void> {
    await this.guard("media-folder-open-failed", async () => {
      // A zero-item list establishes and validates the private layout without
      // exposing a separate generic mkdir/path capability.
      await this.store.list({ limit: 0 });
      await this.openNativeFolder(this.root);
    });
  }

  private async guard<T>(
    publicError: string,
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      return await operation();
    } catch {
      // Native/store errors can contain absolute paths. Keep that detail on
      // the trusted side of IPC and expose a stable path-free failure only.
      throw new Error(publicError);
    }
  }
}
