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
  export type Drop = {
    files: File[];
    directories: File[];
  };

  type EntryProbe = { isDirectory?: boolean };
  type ItemWithEntry = DataTransferItem & {
    webkitGetAsEntry?: () => EntryProbe | null;
  };

  /** Split a real drop into ordinary files and directory handles. Pure apart
   * from reading the browser-provided transfer objects. */
  export function splitDrop(data: DataTransfer | null): Drop {
    if (!data) return { files: [], directories: [] };

    const transferFiles = Array.from(data.files ?? []);
    const items = Array.from(data.items ?? []).filter(
      (item) => item.kind === "file"
    );
    // Older/non-Chromium browsers may expose `.files` without `.items`. They
    // cannot prove a directory, so preserve every item as an ordinary file.
    if (items.length === 0) {
      return { files: transferFiles, directories: [] };
    }

    const files: File[] = [];
    const directories: File[] = [];
    items.forEach((item, index) => {
      // Chromium normally returns the same live disk-backed File here. Fall
      // back by file-item index for Electron builds where a directory entry's
      // getAsFile() is null but DataTransfer.files still carries the handle.
      const file = item.getAsFile() ?? transferFiles[index];
      if (!file) return;
      const entry = (item as ItemWithEntry).webkitGetAsEntry?.();
      if (entry?.isDirectory === true) directories.push(file);
      else files.push(file);
    });
    return { files, directories };
  }

  /** Clipboard pastes carry copied file bodies, never an affirmative local
   * directory grant. Preserve all of them as ordinary files. */
  export function pasteFiles(data: DataTransfer | null): File[] {
    return data ? Array.from(data.files ?? []) : [];
  }
}
