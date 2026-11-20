import { DesktopCompatibility } from "@grida/desktop-bridge";
import { DesktopUpdateFeed } from "./desktop-update-feed";
import { DesktopUpdateWindow } from "./desktop-update-window";

const HANDSHAKE_TIMEOUT_MS = 5_000;
const FEED_WAIT_MS = 90_000;
const CHECK_INTERVAL_MS = 10 * 60 * 1_000;
const RELEASES_URL = "https://github.com/gridaco/grida/releases/latest";
const REQUIRED_TITLE = "Update to continue";

/** Owns production compatibility admission and the user-visible updater. */
export class DesktopUpdates {
  #options: DesktopUpdates.Options;
  #window: DesktopUpdateWindow;
  #startup?: PromiseWithResolvers<boolean>;
  #generation = 0;
  #open = false;
  #hostedDesktopVersion?: string;
  #downloadUrl?: string;
  #restartVersion?: string;
  #lastNotification?: string;
  #backgroundCheck = false;
  #timer?: NodeJS.Timeout;

  constructor(options: DesktopUpdates.Options) {
    this.#options = options;
    this.#window = new DesktopUpdateWindow(
      (action) => this.#action(action),
      () => this.#dismiss()
    );
  }

  admitStartup(): Promise<boolean> {
    if (this.#startup) return this.#startup.promise;
    this.#startup = Promise.withResolvers<boolean>();
    const startup = this.#startup;
    void this.#check(false);
    return startup.promise;
  }

  checkFromMenu(): void {
    if (this.#open) {
      this.focus();
      return;
    }
    void this.#check(true);
  }

  focus(): void {
    this.#window.focus();
  }

  startBackgroundChecks(): void {
    if (!this.#options.feed || this.#timer) return;
    this.#timer = setInterval(
      () => void this.#notifyWhenDownloaded(),
      CHECK_INTERVAL_MS
    );
    this.#timer.unref();
    void this.#notifyWhenDownloaded();
  }

  stopBackgroundChecks(): void {
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  #dismiss(): void {
    this.#generation++;
    this.#open = false;
    this.#downloadUrl = undefined;
    this.#restartVersion = undefined;
    this.#startup?.resolve(false);
    this.#startup = undefined;
  }

  #action(action: DesktopUpdateWindow.Action): void {
    switch (action) {
      case "retry":
        void this.#check(true);
        break;
      case "restart":
        if (this.#restartVersion && this.#options.feed) {
          const feed = this.#options.feed;
          const downloadUrl = this.#downloadUrl;
          const version = this.#restartVersion;
          this.#options.restart(() =>
            feed.install(version, () =>
              this.#options.installFailed(downloadUrl)
            )
          );
        }
        break;
      case "download":
        if (this.#downloadUrl) {
          const generation = this.#generation;
          void this.#options.openExternal(this.#downloadUrl).catch(() => {
            if (generation !== this.#generation) return;
            void this.#show({
              title: "Couldn't open the installer page",
              message: "Try opening the installer again.",
              actions: ["download"],
            });
          });
        }
        break;
    }
  }

  async #check(showProgress: boolean): Promise<void> {
    const generation = ++this.#generation;
    this.#restartVersion = undefined;
    this.#downloadUrl = undefined;
    if (showProgress) {
      void this.#show({
        title: "Checking for updates…",
        message: "Checking the installed version of Grida Desktop.",
      });
    }
    const hostedVersion = await this.#fetchHostedVersion();
    if (generation !== this.#generation) return;
    if (hostedVersion === null) {
      this.#downloadUrl = this.#hostedReleaseDownload();
      void this.#show({
        title: "Couldn't check for updates",
        message: "Check your internet connection and try again.",
        detail: `Installed version: ${this.#options.version}`,
        actions: this.#downloadUrl ? ["retry", "download"] : ["retry"],
      });
      return;
    }

    this.#hostedDesktopVersion = hostedVersion;
    const required = this.#requiresUpdate(this.#options.version);
    if (this.#startup && !required) {
      const startup = this.#startup;
      this.#startup = undefined;
      this.#dismiss();
      this.#window.close();
      startup.resolve(true);
      return;
    }

    this.#downloadUrl = this.#hostedReleaseDownload();
    if (required || this.#options.feed) {
      void this.#show({
        title: required ? REQUIRED_TITLE : "Checking for updates…",
        message: required
          ? `Install Grida ${hostedVersion}.`
          : "Looking for a newer version of Grida Desktop.",
        detail: this.#versions(this.#downloadUrl ? hostedVersion : undefined),
        actions: this.#downloadUrl ? ["download"] : undefined,
      });
    }
    const feed = this.#options.feed;
    if (!feed) {
      const result = required
        ? ({ kind: "unavailable" } as const)
        : await this.#checkLinuxRelease();
      if (generation === this.#generation) this.#present(result);
      return;
    }
    // The UI can offer a manual fallback without abandoning a live download.
    const timer = setTimeout(() => {
      if (generation === this.#generation)
        this.#present({ kind: "unavailable" });
    }, FEED_WAIT_MS);
    timer.unref();
    const result = await feed
      .check(hostedVersion)
      .finally(() => clearTimeout(timer));
    if (generation === this.#generation) this.#present(result);
  }

  async #checkLinuxRelease(): Promise<DesktopUpdates.Result> {
    const version = await this.#options.linuxRelease?.();
    if (!version) return { kind: "unavailable" };
    return DesktopCompatibility.compare(version, this.#options.version) === 1
      ? { kind: "available", version }
      : { kind: "current" };
  }

  #present(result: DesktopUpdates.Result): void {
    const hostedVersion = this.#hostedDesktopVersion;
    const required = this.#requiresUpdate(this.#options.version);
    const ready =
      result.kind === "downloaded" && !this.#requiresUpdate(result.version)
        ? result.version
        : undefined;
    const offered =
      ready ?? (result.kind === "available" ? result.version : undefined);
    this.#restartVersion = ready;
    this.#downloadUrl = offered
      ? (DesktopCompatibility.releaseUrl(offered) ?? undefined)
      : required || this.#options.feed || result.kind === "unavailable"
        ? this.#hostedReleaseDownload()
        : undefined;

    if (ready) {
      void this.#show({
        title: required ? REQUIRED_TITLE : "Update ready",
        message: required
          ? `Version ${ready} is ready to install.`
          : `Grida Desktop ${ready} is ready to install.`,
        detail: this.#versions(ready),
        actions: this.#downloadUrl ? ["restart", "download"] : ["restart"],
      });
    } else if (required || this.#downloadUrl) {
      void this.#show({
        title: required ? REQUIRED_TITLE : "Update available",
        message: required
          ? `Install Grida ${hostedVersion}.`
          : "Download the installer for your platform to update Grida Desktop.",
        detail: this.#versions(offered ?? hostedVersion),
        actions: this.#options.feed ? ["download", "retry"] : ["download"],
      });
    } else if (result.kind === "current") {
      void this.#show({
        title: "Grida Desktop is up to date",
        message: `You’re running version ${this.#options.version}.`,
      });
    } else {
      this.#downloadUrl = RELEASES_URL;
      void this.#show({
        title: "Couldn't check for updates",
        message: "Try again or view the latest stable installer on GitHub.",
        actions: ["retry", "download"],
      });
    }
  }

  #versions(updateVersion?: string): string {
    return updateVersion
      ? `Installed ${this.#options.version} · Update ${updateVersion}`
      : `Installed ${this.#options.version}`;
  }

  #requiresUpdate(version: string): boolean {
    return (
      this.#hostedDesktopVersion !== undefined &&
      DesktopCompatibility.requiresUpdate(version, this.#hostedDesktopVersion)
    );
  }

  #hostedReleaseDownload(): string | undefined {
    const target = this.#hostedDesktopVersion;
    if (!target) return undefined;
    const order = DesktopCompatibility.compare(target, this.#options.version);
    return order === 1 || order === null
      ? (DesktopCompatibility.releaseUrl(target) ?? undefined)
      : undefined;
  }

  async #notifyWhenDownloaded(): Promise<void> {
    if (this.#backgroundCheck || this.#open || !this.#options.feed) return;
    this.#backgroundCheck = true;
    try {
      const result = await this.#options.feed.check(this.#hostedDesktopVersion);
      if (
        this.#timer &&
        !this.#open &&
        result.kind === "downloaded" &&
        result.version !== this.#lastNotification
      ) {
        this.#lastNotification = result.version;
        this.#present(result);
      }
    } finally {
      this.#backgroundCheck = false;
    }
  }

  async #show(view: DesktopUpdateWindow.View): Promise<void> {
    this.#open = true;
    const generation = this.#generation;
    try {
      await this.#window.show(view);
    } catch {
      if (generation !== this.#generation) return;
      this.#window.close();
      this.#options.showError();
      this.#dismiss();
    }
  }

  /** undefined is the previous renderer without a handshake; null is a failed check. */
  async #fetchHostedVersion(): Promise<string | undefined | null> {
    try {
      const response = await this.#options.requestCompatibility(
        new URL("/desktop/compatibility", this.#options.origin).href,
        AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS)
      );
      // A candidate must also launch against the previous hosted deployment.
      const location = response.headers.get("location");
      const legacyRedirect =
        response.status === 307 &&
        location &&
        new URL(location, this.#options.origin).href ===
          new URL("/sign-in?next=/desktop", this.#options.origin).href;
      if (response.status === 404 || legacyRedirect) {
        void response.body?.cancel().catch(() => {});
        return undefined;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("application/json") ||
        !response.body
      ) {
        void response.body?.cancel().catch(() => {});
        return null;
      }
      const handshake = DesktopCompatibility.parse(await response.json());
      return handshake?.desktopVersion ?? null;
    } catch {
      return null;
    }
  }
}

export namespace DesktopUpdates {
  export type Options = {
    origin: string;
    version: string;
    requestCompatibility: (
      url: string,
      signal: AbortSignal
    ) => Promise<Response>;
    linuxRelease?: () => Promise<string | null>;
    openExternal: (url: string) => Promise<void>;
    restart: (install: () => void) => void;
    installFailed: (downloadUrl?: string) => void;
    showError: () => void;
    feed?: Pick<DesktopUpdateFeed, "check" | "install">;
  };
  export type Result =
    | DesktopUpdateFeed.Result
    | { kind: "available"; version: string };
}
