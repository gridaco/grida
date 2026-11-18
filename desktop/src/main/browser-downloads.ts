/** GRIDA-SEC-016 — accepted downloads own their native destination and lifetime. */
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import {
  dialog,
  type BrowserWindow,
  type DownloadItem,
  type WebContents,
} from "electron";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { atomicWrite } from "@grida/daemon/server";

/** One browser-wide destination; websites never supply native path arguments. */
export class BrowserDownloads {
  readonly #file: string;
  #directory: string | null = null;
  #ask = false;
  #confirmation: { droppedDownloads: boolean } | null = null;
  #tail: Promise<void> = Promise.resolve();
  readonly #items = new Set<DownloadItem>();

  constructor(
    userData: string,
    readonly defaultDirectory: string
  ) {
    this.#file = path.join(userData, "browser-downloads.json");
    try {
      const info = lstatSync(this.#file);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 16 * 1024)
        return;
      const descriptor = openSync(
        this.#file,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
      );
      let data: unknown;
      try {
        const current = fstatSync(descriptor);
        if (!current.isFile() || current.size > 16 * 1024) return;
        const buffer = Buffer.alloc(16 * 1024 + 1);
        let length = 0;
        while (length < buffer.length) {
          const count = readSync(
            descriptor,
            buffer,
            length,
            buffer.length - length,
            null
          );
          if (!count) break;
          length += count;
        }
        if (length > 16 * 1024) return;
        data = JSON.parse(
          new TextDecoder("utf8", { fatal: true }).decode(
            buffer.subarray(0, length)
          )
        );
      } finally {
        closeSync(descriptor);
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      const value = data as Record<string, unknown>;
      if (
        Object.keys(value).length !== 3 ||
        value.version !== 1 ||
        typeof value.askBeforeDownload !== "boolean"
      )
        return;
      if (
        value.directory !== null &&
        (typeof value.directory !== "string" ||
          !path.isAbsolute(value.directory) ||
          Buffer.byteLength(value.directory) > 8192 ||
          /[\p{Cc}\p{Cs}]/u.test(value.directory))
      )
        return;
      this.#ask = value.askBeforeDownload;
      this.#directory = value.directory as string | null;
    } catch {
      // Invalid preferences never prevent ordinary browsing or downloads.
    }
  }

  preferences(): DesktopBrowser.Management.DownloadPreferences {
    return {
      askBeforeDownload: this.#ask,
      directoryName: this.#directory
        ? this.#label(path.basename(this.#directory))
        : null,
    };
  }

  setPrompt(
    raw: unknown,
    check: () => void = () => {}
  ): Promise<DesktopBrowser.Management.DownloadPreferences> {
    const request = DesktopBrowser.Management.parseDownloadPrompt(raw);
    if (!request)
      return Promise.reject(new Error("browser_download_preferences_invalid"));
    return this.#queue(async () => {
      check();
      await this.#save(request.askBeforeDownload, this.#directory, check);
      this.#ask = request.askBeforeDownload;
      return this.preferences();
    });
  }

  async chooseDirectory(
    parent: BrowserWindow,
    check: () => void = () => {}
  ): Promise<DesktopBrowser.Management.DownloadPreferences | null> {
    check();
    const result = await dialog.showOpenDialog(parent, {
      title: "Browser download location",
      defaultPath: this.#directory ?? this.defaultDirectory,
      properties: ["openDirectory", "createDirectory"],
    });
    check();
    if (result.canceled || result.filePaths.length !== 1) return null;
    const directory = result.filePaths[0];
    if (
      !path.isAbsolute(directory) ||
      /[\p{Cc}\p{Cs}]/u.test(directory) ||
      Buffer.byteLength(directory) > 8192 ||
      !statSync(directory).isDirectory()
    )
      throw new Error("browser_download_directory_invalid");
    return this.#queue(async () => {
      check();
      await this.#save(this.#ask, directory, check);
      this.#directory = directory;
      return this.preferences();
    });
  }

  /** Must run synchronously inside Session's will-download callback. */
  accept(
    event: { preventDefault(): void },
    item: DownloadItem,
    contents: WebContents,
    parent: BrowserWindow,
    isLive: () => boolean,
    confirmDownload = false
  ): void {
    if (!isLive() || contents.isDestroyed() || parent.isDestroyed()) {
      event.preventDefault();
      return;
    }
    const needsConfirmation = this.#ask || confirmDownload;
    if (needsConfirmation && this.#confirmation) {
      this.#confirmation.droppedDownloads = true;
      event.preventDefault();
      return;
    }
    let reserved: { file: string; dev: number; ino: number } | undefined;
    const release = () => {
      if (!reserved) return;
      try {
        const info = lstatSync(reserved.file);
        if (
          info.isFile() &&
          info.dev === reserved.dev &&
          info.ino === reserved.ino &&
          info.size === 0
        )
          unlinkSync(reserved.file);
      } catch {
        /* Completed or already cleaned up by Chromium. */
      }
      reserved = undefined;
    };
    try {
      const directory = this.#directory ?? this.defaultDirectory;
      const name = BrowserDownloads.filename(item.getFilename());
      let destination: string;
      if (needsConfirmation) {
        const confirmation = { droppedDownloads: false };
        this.#confirmation = confirmation;
        let chosen: string | undefined;
        try {
          chosen = dialog.showSaveDialogSync(parent, {
            title: "Save browser download",
            defaultPath: path.join(directory, name),
          });
        } finally {
          this.#confirmation = null;
          // Report reentrant cancellations together after the Save dialog and
          // the original will-download callback have both unwound.
          if (confirmation.droppedDownloads)
            void Promise.resolve()
              .then(() => {
                if (
                  isLive() &&
                  !contents.isDestroyed() &&
                  !parent.isDestroyed()
                )
                  return dialog.showMessageBox(parent, {
                    type: "info",
                    message: "A browser download was canceled",
                    detail:
                      "A save dialog was already open. Retry the download.",
                  });
              })
              .catch(() => {});
        }
        if (
          !chosen ||
          !isLive() ||
          contents.isDestroyed() ||
          parent.isDestroyed()
        ) {
          event.preventDefault();
          return;
        }
        destination = chosen;
      } else {
        mkdirSync(directory, { recursive: true });
        const extension = path.extname(name);
        const stem = name.slice(0, name.length - extension.length);
        destination = "";
        for (let attempt = 0; attempt < 10_000; attempt++) {
          const candidate = path.join(
            directory,
            attempt ? `${stem} (${attempt})${extension}` : name
          );
          if (existsSync(candidate)) continue;
          try {
            const descriptor = openSync(candidate, "wx", 0o600);
            const info = fstatSync(descriptor);
            closeSync(descriptor);
            reserved = { file: candidate, dev: info.dev, ino: info.ino };
            destination = candidate;
            break;
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
          }
        }
        if (!destination) throw new Error("browser_download_name_unavailable");
      }
      // Admission is complete here. The accepted native job can outlive its tab.
      item.setSavePath(destination);
      this.#items.add(item);
      item.once("done", (_event, state) => {
        this.#items.delete(item);
        if (state !== "completed") release();
      });
    } catch {
      release();
      event.preventDefault();
      if (!parent.isDestroyed())
        void dialog.showMessageBox(parent, {
          type: "error",
          message: "The download could not be saved.",
          detail:
            "Choose a writable download location in Settings → Browser and try again.",
        });
    }
  }

  cancelAll(): void {
    for (const item of this.#items) {
      try {
        item.cancel();
      } catch {
        /* A completed item may already be gone. */
      }
    }
    this.#items.clear();
  }

  static filename(raw: string): string {
    let text = path
      .basename(raw.replace(/\\/g, "/"))
      .replace(/[<>:"/\\|?*\p{Cc}\p{Cs}]/gu, "_")
      .replace(/[. ]+$/g, "")
      .trim();
    if (!text || text === "." || text === "..") text = "download";
    const extension = path.extname(text);
    const suffix = Buffer.byteLength(extension) <= 32 ? extension : "";
    const stem = suffix ? text.slice(0, -suffix.length) : text;
    let name = "";
    for (const character of stem) {
      if (Buffer.byteLength(name + character + suffix) > 180) break;
      name += character;
    }
    name += suffix;
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
      name = `_${name}`;
    return name || "download";
  }

  #label(raw: string): string {
    let label = "";
    for (const character of raw.trim()) {
      if (/[/\\\p{Cc}\p{Cs}]/u.test(character)) continue;
      if (
        Buffer.byteLength(label + character) >
        DesktopBrowser.Management.MAX_DIRECTORY_NAME_BYTES
      )
        break;
      label += character;
    }
    return label.trim() || "Selected folder";
  }

  async #save(
    askBeforeDownload: boolean,
    directory: string | null,
    check: () => void
  ): Promise<void> {
    await atomicWrite(
      this.#file,
      JSON.stringify({ version: 1, askBeforeDownload, directory }),
      {
        mode: 0o600,
        before_commit: async () => {
          check();
          try {
            const info = lstatSync(this.#file);
            if (!info.isFile() || info.isSymbolicLink())
              throw new Error("browser_download_preferences_invalid");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
          check();
        },
      }
    );
  }

  #queue<T>(action: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(action);
    this.#tail = result.then(
      () => {},
      () => {}
    );
    return result;
  }
}
