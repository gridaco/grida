import { DesktopCompatibility } from "@grida/desktop-bridge";
import { DesktopUpdateFeed } from "./desktop-update-feed";
import { DesktopUpdateWindow } from "./desktop-update-window";

const HANDSHAKE_TIMEOUT_MS = 5_000;
const INSTALLER_FALLBACK_MS = 45_000;
const UPDATE_TIMEOUT_MS = 10 * 60 * 1_000;
const CHECK_INTERVAL_MS = 10 * 60 * 1_000;
const RELEASES_URL = "https://github.com/gridaco/grida/releases/latest";
const REQUIRED_TITLE = "Update to continue";

/**
 * Owns production compatibility admission and the user-visible updater.
 * See test/desktop-update-required.md for packaged-app verification.
 */
export class DesktopUpdates {
  #options: DesktopUpdates.Options;
  #window: DesktopUpdateWindow;
  #startup?: PromiseWithResolvers<boolean>;
  #foregroundCheck?: AbortController;
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
    if (this.#foregroundCheck || this.#restartVersion) {
      if (this.#open) this.focus();
      else this.#showCompatibilityCheck();
      return;
    }
    this.focus();
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
    this.#foregroundCheck?.abort();
    this.#foregroundCheck = undefined;
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
            this.#options.showError(
              "Couldn't open the installer page",
              "Try opening the installer again."
            );
          });
        }
        break;
    }
  }

  async #check(showProgress: boolean): Promise<void> {
    if (this.#foregroundCheck) return;
    const check = new AbortController();
    this.#foregroundCheck = check;
    const { signal } = check;
    this.#generation++;
    this.#restartVersion = undefined;
    this.#downloadUrl = undefined;
    if (showProgress) this.#showCompatibilityCheck();

    try {
      const hostedVersion = await this.#fetchHostedVersion(signal);
      if (signal.aborted) return;
      if (hostedVersion === null) {
        this.#showCheckFailure(this.#hostedReleaseDownload());
        return;
      }

      this.#hostedDesktopVersion = hostedVersion;
      const requiredVersion = this.#requiresUpdate(this.#options.version)
        ? hostedVersion
        : undefined;
      if (this.#startup && !requiredVersion) {
        const startup = this.#startup;
        this.#startup = undefined;
        this.#dismiss();
        this.#window.close();
        startup.resolve(true);
        return;
      }

      const feed = this.#options.feed;
      if (feed) {
        await this.#checkFeed(feed, requiredVersion, signal);
      } else if (requiredVersion) {
        this.#showInstaller(requiredVersion);
      } else {
        const result = await this.#checkLinuxRelease();
        if (signal.aborted) return;
        if (result.kind === "unavailable") {
          this.#showCheckFailure(this.#fallbackDownload());
        } else {
          this.#present(result);
        }
      }
    } finally {
      if (this.#foregroundCheck === check) this.#foregroundCheck = undefined;
    }
  }

  #showCompatibilityCheck(): void {
    void this.#show({ title: "Checking for updates…", busy: true });
  }

  #showCheckFailure(downloadUrl?: string): void {
    this.#downloadUrl = downloadUrl;
    void this.#show({
      title: "Couldn't check for updates",
      message: "Check your internet connection and try again.",
      action: "retry",
      installerLink: Boolean(downloadUrl),
    });
  }

  async #checkFeed(
    feed: DesktopUpdates.Feed,
    requiredVersion: string | undefined,
    signal: AbortSignal
  ): Promise<void> {
    const pending = feed.check(this.#hostedDesktopVersion);
    let elapsedMs = feed.checkElapsedMs;
    let downloading = false;
    const showProgress = () => {
      const showInstaller = elapsedMs >= INSTALLER_FALLBACK_MS;
      this.#downloadUrl = showInstaller ? this.#fallbackDownload() : undefined;
      if (elapsedMs >= UPDATE_TIMEOUT_MS) {
        void this.#show({
          title: "Update is taking too long",
          message: requiredVersion
            ? `Install Grida Desktop ${requiredVersion} to continue.`
            : undefined,
          action: "download",
        });
        return;
      }
      void this.#show({
        title: downloading ? "Downloading update…" : "Checking for updates…",
        installerLink: showInstaller,
        busy: true,
      });
    };
    const unsubscribe = feed.onDownloading(() => {
      downloading = true;
      showProgress();
    });
    if (!downloading) showProgress();
    const timers = [INSTALLER_FALLBACK_MS, UPDATE_TIMEOUT_MS]
      .filter((deadline) => deadline > elapsedMs)
      .map((deadline) =>
        setTimeout(() => {
          elapsedMs = deadline;
          showProgress();
        }, deadline - elapsedMs).unref()
      );
    const stopObserving = () => {
      for (const timer of timers) clearTimeout(timer);
      unsubscribe();
    };
    signal.addEventListener("abort", stopObserving, { once: true });
    try {
      // Electron cannot cancel a check. A late compatible download can still install.
      const result = await pending;
      if (!signal.aborted) this.#present(result);
    } finally {
      signal.removeEventListener("abort", stopObserving);
      if (!signal.aborted) stopObserving();
    }
  }

  async #checkLinuxRelease(): Promise<DesktopUpdates.Result> {
    const version = await this.#options.linuxRelease?.();
    if (!version) return { kind: "unavailable" };
    return DesktopCompatibility.compare(version, this.#options.version) === 1
      ? { kind: "available", version }
      : { kind: "current" };
  }

  #present(result: DesktopUpdates.Result): void {
    const required = this.#requiresUpdate(this.#options.version);
    if (result.kind === "downloaded" && !this.#requiresUpdate(result.version)) {
      this.#restartVersion = result.version;
      this.#downloadUrl = this.#fallbackDownload(result.version);
      void this.#show({
        title: "Update ready",
        message: `Grida Desktop ${result.version} is ready to install.`,
        action: "restart",
        installerLink: true,
      });
    } else if (result.kind === "available") {
      this.#showInstaller(result.version);
    } else if (result.kind === "current" && !required) {
      if (
        this.#options.feed &&
        this.#hostedDesktopVersion &&
        this.#hostedReleaseDownload()
      ) {
        this.#showInstaller(this.#hostedDesktopVersion);
        return;
      }
      this.#downloadUrl = undefined;
      void this.#show({
        title: "Grida Desktop is up to date",
        message: `You’re running version ${this.#options.version}.`,
      });
    } else {
      this.#downloadUrl = this.#fallbackDownload();
      void this.#show({
        title: required ? REQUIRED_TITLE : "Couldn't check for updates",
        message:
          result.kind === "unavailable"
            ? "The automatic update failed."
            : "Automatic updates did not find a compatible version.",
        detail: required
          ? `Installed ${this.#options.version} · Required ${this.#hostedDesktopVersion}`
          : undefined,
        action: "retry",
        installerLink: true,
      });
    }
  }

  #showInstaller(version: string): void {
    this.#downloadUrl = this.#fallbackDownload(version);
    const required = this.#requiresUpdate(this.#options.version);
    void this.#show({
      title: required ? REQUIRED_TITLE : "Update available",
      message: `Install Grida Desktop ${version} to ${required ? "continue" : "update"}.`,
      detail: `Installed ${this.#options.version}`,
      action: "download",
    });
  }

  #fallbackDownload(version?: string): string {
    return (
      (version && DesktopCompatibility.releaseUrl(version)) ||
      this.#hostedReleaseDownload() ||
      RELEASES_URL
    );
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
        !this.#requiresUpdate(result.version) &&
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
      this.#options.showError(
        "Couldn't open the Grida update window",
        "Reopen Grida and try again."
      );
      this.#dismiss();
    }
  }

  /** undefined is the previous renderer without a handshake; null is a failed check. */
  async #fetchHostedVersion(
    signal: AbortSignal
  ): Promise<string | undefined | null> {
    try {
      const response = await this.#options.requestCompatibility(
        new URL("/desktop/compatibility", this.#options.origin).href,
        AbortSignal.any([signal, AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS)])
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
    showError: (title: string, message: string) => void;
    feed?: Feed;
  };
  export type Feed = Pick<
    DesktopUpdateFeed,
    "check" | "checkElapsedMs" | "install" | "onDownloading"
  >;
  export type Result =
    | DesktopUpdateFeed.Result
    | { kind: "available"; version: string };
}
