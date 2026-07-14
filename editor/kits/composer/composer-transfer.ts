/**
 * Browser transfer classification for the composer.
 *
 * A directory drop is a `DataTransferItem(kind="file")`, just like an
 * extensionless file. MIME and byte size therefore cannot distinguish the two;
 * Chromium/WebKit's entry metadata can. The returned `File` is the ORIGINAL
 * disk-backed object from the transfer so an Electron preload can resolve it
 * with `webUtils.getPathForFile` without exposing that path to the renderer.
 */
export namespace ComposerTransfer {
  export type Source = "paste" | "drop";

  export type Resource =
    | { kind: "file"; file: File }
    | { kind: "directory"; file: File };

  /**
   * One browser transfer gesture. `source` preserves how the resource entered
   * the composer; each resource preserves both its kind and ORIGINAL `File`.
   * Product policy can therefore distinguish copied bytes from an affirmative
   * disk drop before deciding whether to inline, copy, reference, or reject it.
   */
  export type Event = {
    source: Source;
    resources: Resource[];
  };

  export type Drop = {
    files: File[];
    directories: File[];
  };

  type EntryProbe = { isDirectory?: boolean };
  type ItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => EntryProbe | null;
  };

  /** Read a real drop without erasing gesture provenance or resource kind. Pure
   * apart from reading the browser-provided transfer objects. */
  export function fromDrop(data: DataTransfer | null): Event {
    if (!data) return { source: "drop", resources: [] };

    const transferFiles = Array.from(data.files ?? []);
    const items = Array.from(data.items ?? []).filter(
      (item) => item.kind === "file"
    );
    // Older/non-Chromium browsers may expose `.files` without `.items`. They
    // cannot prove a directory, so preserve every item as an ordinary file.
    if (items.length === 0) {
      return {
        source: "drop",
        resources: transferFiles.map((file) => ({ kind: "file", file })),
      };
    }

    const resources: Resource[] = [];
    items.forEach((item, index) => {
      // Chromium normally returns the same live disk-backed File here. Fall
      // back by file-item index for Electron builds where a directory entry's
      // getAsFile() is null but DataTransfer.files still carries the handle.
      const file = item.getAsFile() ?? transferFiles[index];
      if (!file) return;
      const entry = (item as ItemWithEntry).webkitGetAsEntry?.();
      resources.push({
        kind: entry?.isDirectory === true ? "directory" : "file",
        file,
      });
    });
    return { source: "drop", resources };
  }

  /** Read a clipboard paste. Clipboard files are copied bodies, never an
   * affirmative local directory grant, regardless of entry-shaped metadata. */
  export function fromPaste(data: DataTransfer | null): Event {
    return {
      source: "paste",
      resources: data
        ? Array.from(data.files ?? []).map((file) => ({ kind: "file", file }))
        : [],
    };
  }

  /** Compatibility projection for callers that still consume split arrays. */
  export function splitDrop(data: DataTransfer | null): Drop {
    return split(fromDrop(data));
  }

  /** Compatibility projection for callers that still consume pasted files. */
  export function pasteFiles(data: DataTransfer | null): File[] {
    return split(fromPaste(data)).files;
  }

  /** Project a provenance-preserving event onto the legacy callback shape. */
  export function split(event: Event): Drop {
    const files: File[] = [];
    const directories: File[] = [];
    for (const resource of event.resources) {
      if (resource.kind === "directory") directories.push(resource.file);
      else files.push(resource.file);
    }
    return { files, directories };
  }
}
