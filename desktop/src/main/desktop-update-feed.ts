import { DesktopCompatibility } from "@grida/desktop-bridge";
import type { AutoUpdater } from "electron";

/** Main's single owner for checks against the existing Electron release feed. */
export class DesktopUpdateFeed {
  #updater: AutoUpdater;
  #installed: string;
  #active?: PromiseWithResolvers<DesktopUpdateFeed.Result> & {
    startedAt: number;
  };
  #downloading = false;
  #downloadListeners = new Set<() => void>();
  #downloaded?: string;
  #configured = false;

  constructor(
    updater: AutoUpdater,
    installed: string,
    platform: NodeJS.Platform,
    arch: string
  ) {
    this.#updater = updater;
    this.#installed = installed;
    updater.on("update-available", () => {
      if (!this.#active || this.#downloading) return;
      this.#downloading = true;
      for (const listener of this.#downloadListeners) listener();
    });
    updater.on("error", () => this.#finish({ kind: "unavailable" }));
    updater.on("update-not-available", () => this.#finish({ kind: "current" }));
    updater.on("update-downloaded", (_event, _notes, releaseName) => {
      // The GitHub release assembler names releases v<version>. Squirrel
      // Windows supplies the package version without the v prefix.
      const version = releaseName?.replace(/^v/, "");
      if (
        !version ||
        !DesktopCompatibility.releaseUrl(version) ||
        DesktopCompatibility.compare(version, this.#installed) !== 1
      ) {
        this.#downloaded = undefined;
        this.#finish({ kind: "unavailable" });
        return;
      }
      this.#downloaded = version;
      this.#finish({ kind: "downloaded", version });
    });
    try {
      updater.setFeedURL({
        url: `https://update.electronjs.org/gridaco/grida/${platform}-${arch}/${encodeURIComponent(installed)}`,
        headers: { "User-Agent": `Grida Desktop/${installed}` },
      });
      this.#configured = true;
    } catch {
      // The verified installer remains available when native setup fails.
    }
  }

  /** A foreground check may join a download that started in the background. */
  onDownloading(listener: () => void): () => void {
    this.#downloadListeners.add(listener);
    if (this.#downloading) listener();
    return () => {
      this.#downloadListeners.delete(listener);
    };
  }

  get checkElapsedMs(): number {
    return this.#active ? performance.now() - this.#active.startedAt : 0;
  }

  check(hostedDesktopVersion?: string): Promise<DesktopUpdateFeed.Result> {
    if (this.#active) return this.#active.promise;
    if (!this.#configured) return Promise.resolve({ kind: "unavailable" });
    if (
      this.#downloaded &&
      (!hostedDesktopVersion ||
        !DesktopCompatibility.requiresUpdate(
          this.#downloaded,
          hostedDesktopVersion
        ))
    ) {
      return Promise.resolve({ kind: "downloaded", version: this.#downloaded });
    }

    // The native updater can replace its pending installer during this check.
    // Only a fresh download event can identify what is ready to install.
    this.#downloaded = undefined;
    const active = {
      ...Promise.withResolvers<DesktopUpdateFeed.Result>(),
      startedAt: performance.now(),
    };
    this.#active = active;
    try {
      this.#updater.checkForUpdates();
    } catch {
      this.#finish({ kind: "unavailable" });
    }
    return active.promise;
  }

  install(expectedVersion: string, onFailure: () => void): void {
    if (this.#downloaded !== expectedVersion) {
      onFailure();
      return;
    }
    let failed = false;
    const fail = () => {
      if (failed) return;
      failed = true;
      this.#updater.off("error", fail);
      onFailure();
    };
    this.#updater.once("error", fail);
    try {
      this.#updater.quitAndInstall();
    } catch {
      fail();
    }
  }

  #finish(result: DesktopUpdateFeed.Result): void {
    const active = this.#active;
    this.#active = undefined;
    this.#downloading = false;
    active?.resolve(result);
  }
}

export namespace DesktopUpdateFeed {
  export type Result =
    | { kind: "current" | "unavailable" }
    | { kind: "downloaded"; version: string };
}
