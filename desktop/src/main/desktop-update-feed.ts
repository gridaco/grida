import { DesktopCompatibility } from "@grida/desktop-bridge";
import type { AutoUpdater } from "electron";

/** Main's single owner for checks against the existing Electron release feed. */
export class DesktopUpdateFeed {
  #updater: AutoUpdater;
  #installed: string;
  #active?: PromiseWithResolvers<DesktopUpdateFeed.Result>;
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

  check(): Promise<DesktopUpdateFeed.Result> {
    if (this.#active) return this.#active.promise;
    if (!this.#configured) return Promise.resolve({ kind: "unavailable" });
    if (this.#downloaded)
      return Promise.resolve({ kind: "downloaded", version: this.#downloaded });

    const active = Promise.withResolvers<DesktopUpdateFeed.Result>();
    this.#active = active;
    try {
      this.#updater.checkForUpdates();
    } catch {
      this.#finish({ kind: "unavailable" });
    }
    return active.promise;
  }

  install(onFailure: () => void): void {
    if (!this.#downloaded) {
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
    active?.resolve(result);
  }
}

export namespace DesktopUpdateFeed {
  export type Result =
    | { kind: "current" | "unavailable" }
    | { kind: "downloaded"; version: string };
}
