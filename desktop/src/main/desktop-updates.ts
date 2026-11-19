import { DesktopCompatibility } from "@grida/desktop-bridge";
import { DesktopUpdateFeed } from "./desktop-update-feed";
import { DesktopUpdateWindow } from "./desktop-update-window";

const HANDSHAKE_TIMEOUT_MS = 5_000;
const HANDSHAKE_MAX_BYTES = 4_096;
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
  #restartAvailable = false;
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
    this.#restartAvailable = false;
    this.#startup?.resolve(false);
    this.#startup = undefined;
  }

  #action(action: DesktopUpdateWindow.Action): void {
    switch (action) {
      case "retry":
        void this.#check(true);
        break;
      case "restart":
        if (this.#restartAvailable && this.#options.feed) {
          const feed = this.#options.feed;
          const downloadUrl = this.#downloadUrl;
          this.#options.restart(() =>
            feed.install(() => this.#options.installFailed(downloadUrl))
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
    this.#restartAvailable = false;
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
    const result = this.#options.feed
      ? await waitForFeed(this.#options.feed.check())
      : undefined;
    if (generation === this.#generation) this.#present(result);
  }

  #present(result?: DesktopUpdateFeed.Result): void {
    const hostedVersion = this.#hostedDesktopVersion;
    const required = this.#requiresUpdate(this.#options.version);
    const ready =
      result?.kind === "downloaded" && !this.#requiresUpdate(result.version)
        ? result.version
        : undefined;
    this.#restartAvailable = ready !== undefined;
    this.#downloadUrl =
      (ready ? DesktopCompatibility.releaseUrl(ready) : null) ??
      this.#hostedReleaseDownload();

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
        detail: this.#versions(hostedVersion),
        actions: this.#options.feed ? ["download", "retry"] : ["download"],
      });
    } else if (result?.kind === "current" || (!result && hostedVersion)) {
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
      const result = await this.#options.feed.check();
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
      const response = await this.#options.fetch(
        new URL("/desktop/compatibility", this.#options.origin).href,
        {
          credentials: "omit",
          redirect: "manual",
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(HANDSHAKE_TIMEOUT_MS),
        }
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
      const reader = response.body.getReader();
      const bytes = new Uint8Array(HANDSHAKE_MAX_BYTES);
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (length + value.length > bytes.length) {
          void reader.cancel().catch(() => {});
          return null;
        }
        bytes.set(value, length);
        length += value.length;
      }
      const handshake = DesktopCompatibility.parse(
        JSON.parse(new TextDecoder().decode(bytes.subarray(0, length)))
      );
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
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    openExternal: (url: string) => Promise<void>;
    restart: (install: () => void) => void;
    installFailed: (downloadUrl?: string) => void;
    showError: () => void;
    feed?: Pick<DesktopUpdateFeed, "check" | "install">;
  };
}

async function waitForFeed(
  check: Promise<DesktopUpdateFeed.Result>
): Promise<DesktopUpdateFeed.Result> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      check,
      new Promise<DesktopUpdateFeed.Result>((resolve) => {
        timer = setTimeout(
          () => resolve({ kind: "unavailable" }),
          FEED_WAIT_MS
        );
        timer.unref();
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
