/**
 * GRIDA-SEC-016 — Main admits DOM guests in one isolated browser profile.
 * Guest contents never inherit the application's preload, cookies or authority.
 */
import {
  BrowserWindow,
  dialog,
  Menu,
  type IpcMainEvent,
  type LoadURLOptions,
  session,
  shell,
  type IpcMainInvokeEvent,
  type NativeImage,
  type Session,
  type WebContents,
  type WebFrameMain,
  type WebPreferences,
} from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { ipc_sender } from "./ipc-sender";
import { BrowserFavicon } from "./browser-favicon";
import { BrowserLegacyProfiles } from "./browser-legacy-profiles";
import type { BrowserHistory } from "./browser-history";
import { BrowserSitePolicy } from "./browser-site-policy";
import { BrowserAuthDialog } from "./browser-auth-dialog";
import type { BrowserDownloads } from "./browser-downloads";
import { BrowserPageTools } from "./browser-page-tools";
import { BrowserFindDialog } from "./browser-find-dialog";
import { BrowserExternalLinks } from "./browser-external-links";

type Page = {
  guest: WebContents | null;
  retiring: Set<WebContents>;
  browserSession: Session;
  favicon: BrowserFavicon;
  mount: Mount | null;
  active: boolean;
  rendered: boolean;
  state: { -readonly [K in keyof DesktopBrowser.Page]: DesktopBrowser.Page[K] };
  referrer?: LoadURLOptions["httpReferrer"];
  navigation: number;
};
type Owner = {
  window: BrowserWindow;
  shell: WebContents;
  shellId: number;
  workspaceId: string;
  attachmentId: string | null;
  frame: WebFrameMain | null;
  revision: number;
  pages: Map<string, Page>;
  disposers: (() => void)[];
  thumbnail: { page: Page; token: symbol } | null;
};
type Popup = {
  window: BrowserWindow;
  contents: WebContents;
  owner: Owner;
  openerPage: Page;
};

type Mount = {
  src: string;
  owner: Owner;
  page: Page;
  attachmentId: string;
  frame: WebFrameMain;
  consumed: boolean;
  guest: WebContents | null;
  releaseTombstone: (() => void) | null;
  timer: ReturnType<typeof setTimeout>;
};

const PERMISSION_RELOAD_TIMEOUT_MS = 2_000;
const PERMISSION_CLOSE_TIMEOUT_MS = 2_000;

/** Browser execution and document-scoped guest admission, independent of agents. */
export class DesktopBrowserHost {
  readonly #owners = new Map<number, Owner>();
  #browserSession: Session | undefined;
  #sitePolicy: BrowserSitePolicy | undefined;
  readonly #popups = new Map<WebContents, Popup>();
  readonly #externalLinks = new BrowserExternalLinks();
  readonly #permissionReloads = new WeakSet<WebContents>();
  readonly #resourceNotices = new Set<Owner>();
  readonly #linkIntents = new WeakMap<
    WebContents,
    {
      url: string;
      documentUrl: string;
      disposition: "foreground" | "background";
      expires: number;
    }
  >();
  #clearing = false;
  #resettingPermissions = false;
  readonly #closing = new Set<Promise<void>>();
  #pendingHistoryChange: DesktopBrowser.History.Change | null = null;
  readonly #pendingAttach = new Map<number, symbol>();
  readonly #mounts = new Map<string, Mount>();
  readonly #acceptedMounts = new Map<number, Mount>();

  constructor(
    readonly options: {
      editorOrigin: string;
      admitWindow(window: BrowserWindow): boolean;
      workspaceExists(workspaceId: string): Promise<boolean>;
      history?: BrowserHistory;
      downloads?: BrowserDownloads;
    }
  ) {
    options.history?.subscribe((change) => this.#publishHistory(change));
  }

  async attach(
    event: IpcMainInvokeEvent,
    workspaceId: unknown
  ): Promise<DesktopBrowser.Snapshot> {
    const window = this.#shell(event);
    if (this.#clearing) throw new Error("browser_session_busy");
    if (
      typeof workspaceId !== "string" ||
      !/^[a-f0-9]{16}$/.test(workspaceId) ||
      this.#workspace(event.sender.getURL()) !== workspaceId
    )
      throw new Error("browser_workspace_invalid");
    const href = event.sender.getURL();
    const frame = event.senderFrame;
    const attempt = Symbol();
    this.#pendingAttach.set(event.sender.id, attempt);
    let navigated = false;
    const navigating = (details: { isMainFrame: boolean }) => {
      if (details.isMainFrame) navigated = true;
    };
    const committed = () => {
      navigated = true;
    };
    const failed = (
      _event: unknown,
      _code: number,
      _description: string,
      _url: string,
      isMainFrame: boolean
    ) => {
      if (isMainFrame) navigated = true;
    };
    event.sender.on("did-start-navigation", navigating);
    event.sender.on("did-navigate", committed);
    event.sender.on("did-fail-provisional-load", failed);
    event.sender.on("did-fail-load", failed);
    const check = () => {
      this.#shell(event);
      if (
        navigated ||
        this.#pendingAttach.get(event.sender.id) !== attempt ||
        event.senderFrame !== frame ||
        event.sender.getURL() !== href ||
        this.#clearing
      )
        throw new Error("browser_attachment_expired");
    };
    try {
      if (!(await this.options.workspaceExists(workspaceId)))
        throw new Error("browser_workspace_unavailable");
      check();
      const previous = this.#owners.get(event.sender.id);
      if (previous) await this.#destroy(previous);
      check();
      const owner: Owner = {
        window,
        shell: event.sender,
        shellId: event.sender.id,
        workspaceId,
        attachmentId: randomUUID(),
        frame,
        revision: 0,
        pages: new Map(),
        disposers: [],
        thumbnail: null,
      };
      this.#owners.set(owner.shellId, owner);
      this.#watchOwner(owner);
      return this.#snapshot(owner);
    } finally {
      event.sender.off("did-start-navigation", navigating);
      event.sender.off("did-navigate", committed);
      event.sender.off("did-fail-provisional-load", failed);
      event.sender.off("did-fail-load", failed);
      if (this.#pendingAttach.get(event.sender.id) === attempt)
        this.#pendingAttach.delete(event.sender.id);
    }
  }

  snapshot(
    event: IpcMainInvokeEvent,
    attachmentId: unknown
  ): DesktopBrowser.Snapshot {
    return this.#snapshot(this.#attached(event, attachmentId));
  }
  detach(event: IpcMainInvokeEvent, attachmentId: unknown): Promise<void> {
    return this.#destroy(this.#attached(event, attachmentId));
  }
  create(event: IpcMainInvokeEvent, raw: unknown): DesktopBrowser.Page {
    const request = this.#record(raw);
    const owner = this.#attached(event, request.attachmentId);
    if (this.#clearing) throw new Error("browser_session_busy");
    if (owner.pages.size >= DesktopBrowser.MAX_PAGES)
      throw new Error("browser_page_limit");
    if (
      Object.keys(request).some(
        (key) => key !== "attachmentId" && key !== "url"
      )
    )
      throw new Error("browser_request_invalid");
    const url = request.url === undefined ? null : this.#url(request.url);
    return this.#create(owner, url);
  }
  #create(
    owner: Owner,
    url: string | null,
    created?: {
      openerPageId: string | null;
      disposition: "foreground" | "background";
    },
    referrer?: LoadURLOptions["httpReferrer"]
  ): DesktopBrowser.Page {
    if (!this.#live(owner) || this.#clearing)
      throw new Error("browser_attachment_expired");
    if (owner.pages.size >= DesktopBrowser.MAX_PAGES)
      throw new Error("browser_page_limit");
    const id = randomUUID();
    const browserSession = this.#session();
    const page: Page = {
      guest: null,
      retiring: new Set(),
      browserSession,
      favicon: new BrowserFavicon({
        session: browserSession,
        current: () =>
          this.#live(owner) &&
          owner.pages.get(id) === page &&
          !!page.guest &&
          !page.guest.isDestroyed() &&
          !!DesktopBrowser.normalizeUrl(page.guest.getURL()) &&
          !page.state.failure &&
          !this.#clearing,
        changed: () => this.#changed(owner, page),
      }),
      mount: null,
      active: false,
      rendered: false,
      referrer,
      navigation: 0,
      state: {
        id,
        mounted: false,
        revision: 0,
        url,
        title: "New tab",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        focused: false,
        failure: null,
      },
    };
    owner.pages.set(id, page);
    if (created) {
      page.state.revision = ++owner.revision;
      owner.shell.send(IPC_CHANNELS.BROWSER_CHANGED, {
        type: "created",
        attachmentId: owner.attachmentId!,
        revision: owner.revision,
        page: { ...page.state },
        ...created,
      } satisfies DesktopBrowser.Event);
    } else this.#changed(owner, page);
    return { ...page.state };
  }

  reserveMount(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): DesktopBrowser.GuestMount {
    const [owner, page] = this.#target(event, raw);
    if (page.guest || page.state.failure)
      throw new Error("browser_mount_unavailable");
    if (page.mount) return Object.freeze({ src: page.mount.src });
    const src = DesktopBrowser.MOUNT_URL_PREFIX + randomUUID();
    const mount: Mount = {
      src,
      owner,
      page,
      attachmentId: owner.attachmentId!,
      frame: owner.frame!,
      consumed: false,
      guest: null,
      releaseTombstone: null,
      timer: setTimeout(() => this.#failMount(mount), 15_000),
    };
    mount.timer.unref();
    page.mount = mount;
    this.#mounts.set(src, mount);
    return Object.freeze({ src });
  }

  /** Called by the global, deny-by-default will-attach-webview observer. */
  willAttach(
    contents: WebContents,
    event: { preventDefault(): void },
    preferences: WebPreferences,
    params: Record<string, string>
  ): void {
    const parsed = DesktopBrowser.parseGuestMount({ src: params.src });
    const mount = parsed && this.#mounts.get(parsed.src);
    if (
      !mount ||
      mount.consumed ||
      mount.owner.shell !== contents ||
      this.#acceptedMounts.has(contents.id) ||
      !this.#mountLive(mount)
    ) {
      event.preventDefault();
      return;
    }
    mount.consumed = true;
    this.#acceptedMounts.set(contents.id, mount);
    for (const key of Object.keys(preferences))
      delete (preferences as Record<string, unknown>)[key];
    Object.assign(preferences, {
      session: mount.page.browserSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInSubFrames: false,
      nodeIntegrationInWorker: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, "browser-guest-preload.js"),
      disableDialogs: false,
      safeDialogs: true,
      // Additional stock-runtime hardening; the public window-open handler
      // installed before website load is the authoritative popup policy.
      disablePopups: false,
      navigateOnDragDrop: true,
      backgroundThrottling: true,
    });
    // Electron otherwise loadURLs this source before did-attach-webview fires.
    // No website request may precede actual guest registration and its guards.
    delete params.src;
    delete params.httpreferrer;
    delete params.useragent;
    // Stock42 reads this before the admission event; keep its approved native
    // parameters consistent with the enforced popup preference as well.
    (params as Record<string, unknown>).allowpopups = true;
  }

  /** Capture actual native identity during synchronous creation, never a caller ID. */
  createdContents(contents: WebContents): void {
    if (contents.isDestroyed() || contents.getType() !== "webview") return;
    const embedder = contents.hostWebContents;
    const mount = embedder && this.#acceptedMounts.get(embedder.id);
    if (!mount || mount.guest || !this.#mountLive(mount)) {
      // A consumed claim whose creation never arrived remains a tombstone.
      // A late creation belongs to that claim, never to its replacement.
      if (mount && !mount.guest) this.#releaseAccepted(mount);
      contents.close({ waitForBeforeUnload: false });
      return;
    }
    mount.guest = contents;
  }

  /** Registers only the actual guest supplied by this exact shell's attach event. */
  didAttach(contents: WebContents, guest: WebContents): void {
    const mount = this.#acceptedMounts.get(contents.id);
    if (
      !mount ||
      mount.owner.shell !== contents ||
      !this.#safeGuest(guest, mount)
    ) {
      if (mount?.guest === guest) this.#failMount(mount, "rejected");
      else if (!guest.isDestroyed())
        guest.close({ waitForBeforeUnload: false });
      return;
    }
    const { owner, page } = mount;
    this.#forgetMount(mount);
    page.guest = guest;
    page.state.mounted = true;
    page.state.failure = null;
    this.#observe(owner, page, guest);
    this.#changed(owner, page);
    if (page.state.url) {
      const restorable = DesktopBrowser.normalizeUrl(page.state.url);
      if (restorable) this.#load(owner, page, restorable);
      else {
        page.state.failure = {
          kind: "navigation",
          code: "generated-unavailable",
          message:
            "This generated page is no longer available. Open it again from its source.",
        };
        this.#changed(owner, page);
      }
    }
  }

  setActive(event: IpcMainInvokeEvent, raw: unknown): void {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    if (typeof request.active !== "boolean")
      throw new Error("browser_active_invalid");
    page.active = request.active;
    if (!page.active) this.#blur(owner, page);
  }
  navigate(event: IpcMainInvokeEvent, raw: unknown): void {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    this.#load(owner, page, this.#url(request.url));
  }
  back(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    const guest = this.#guest(page);
    if (guest.navigationHistory.canGoBack()) {
      page.navigation++;
      page.state.loading = true;
      this.#changed(owner, page);
      guest.navigationHistory.goBack();
    }
  }
  forward(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    const guest = this.#guest(page);
    if (guest.navigationHistory.canGoForward()) {
      page.navigation++;
      page.state.loading = true;
      this.#changed(owner, page);
      guest.navigationHistory.goForward();
    }
  }
  reload(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    page.favicon.clear();
    page.state.failure = null;
    page.navigation++;
    page.rendered = false;
    page.state.loading = !!page.guest && !!page.state.url;
    this.#changed(owner, page);
    if (page.guest && !page.guest.isDestroyed()) page.guest.reload();
  }
  stop(event: IpcMainInvokeEvent, raw: unknown): void {
    const [, page] = this.#target(event, raw);
    page.guest?.stop();
  }
  focus(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    if (!page.active) throw new Error("browser_page_inactive");
    if (owner.window.isFocused()) this.#guest(page).focus();
  }
  close(event: IpcMainInvokeEvent, raw: unknown): Promise<boolean> {
    const [owner, page] = this.#target(event, raw);
    return this.#requestClose(owner, page);
  }
  async #requestClose(owner: Owner, page: Page): Promise<boolean> {
    const guest = page.guest;
    if (guest && !guest.isDestroyed()) {
      const closed = await this.#ordinaryClose(guest);
      if (!closed) return false;
    }
    await this.#close(owner, page);
    return true;
  }

  /** Cached public raster metadata. Reading starts no network requests. */
  favicon(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): DesktopBrowser.Favicon | null {
    const [, page] = this.#target(event, raw);
    return page.favicon.get();
  }

  async historyQuery(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): Promise<DesktopBrowser.History.Snapshot> {
    return this.#withHistoryDocument(event, (history, check) =>
      history.query(raw, check)
    );
  }
  async historyRemove(event: IpcMainInvokeEvent, raw: unknown): Promise<void> {
    return this.#withHistoryDocument(event, (history, check) =>
      history.remove(raw, check)
    );
  }
  async #withHistoryDocument<T>(
    event: IpcMainInvokeEvent,
    operation: (history: BrowserHistory, check: () => void) => Promise<T>
  ): Promise<T> {
    const window = this.#managementWindow(event, "browser_history_expired");
    if (this.#clearing) throw new Error("browser_session_busy");
    const history = this.options.history;
    if (!history) throw new Error("browser_history_unavailable");
    const frame = event.senderFrame;
    if (!frame) throw new Error("browser_history_expired");
    const href = frame.url;
    let current = true;
    const revoke = ipc_sender.watchNavigation(event.sender, () => {
      current = false;
    });
    const check = () => {
      if (
        !current ||
        this.#clearing ||
        this.#managementWindow(event, "browser_history_expired") !== window ||
        event.senderFrame !== frame ||
        frame.url !== href
      )
        throw new Error("browser_history_expired");
    };
    try {
      const result = await operation(history, check);
      check();
      return result;
    } finally {
      revoke();
    }
  }
  #publishHistory(change: DesktopBrowser.History.Change): void {
    if (this.#clearing) {
      this.#pendingHistoryChange = change;
      return;
    }
    // Subscribe is renderer-local. Only current Main-owned workspace/Settings
    // documents receive this revision-only invalidation, never guest pages.
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      const sender = window.webContents;
      if (sender.isDestroyed()) continue;
      try {
        this.#managementWindow(
          { sender, senderFrame: sender.mainFrame } as IpcMainInvokeEvent,
          "browser_history_expired"
        );
        sender.send(IPC_CHANNELS.BROWSER_HISTORY_CHANGED, change);
      } catch {
        /* Not an admitted current document. */
      }
    }
  }

  /** Explicit transient pixels; see test/desktop-browser-tab-preview.md. */
  async thumbnail(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): Promise<DesktopBrowser.Thumbnail | null> {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    const guest = page.guest;
    if (
      owner.thumbnail ||
      !guest ||
      !page.rendered ||
      !page.state.url ||
      page.state.loading ||
      page.state.failure
    )
      return null;
    const navigation = page.navigation;
    const token = Symbol();
    owner.thumbnail = { page, token };
    const settled = () => {
      if (owner.thumbnail?.token === token) owner.thumbnail = null;
    };
    let captured: NativeImage | null = null;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const capturing = guest
        .capturePage(undefined, {
          stayHidden: true,
          stayAwake: false,
        })
        .then(
          (image) => {
            settled();
            return image;
          },
          () => {
            settled();
            return null;
          }
        );
      captured = await Promise.race([
        capturing,
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 1500);
          timeout.unref();
        }),
      ]);
    } catch {
      settled();
      /* unavailable compositor frame */
    } finally {
      if (timeout) clearTimeout(timeout);
    }
    const [currentOwner, currentPage] = this.#target(event, request);
    if (
      currentOwner !== owner ||
      currentPage !== page ||
      page.guest !== guest ||
      page.navigation !== navigation
    )
      return null;
    try {
      if (!captured || captured.isEmpty()) return null;
      const size = captured.getSize();
      if (size.width <= 0 || size.height <= 0) return null;
      const scale = Math.min(
        1,
        DesktopBrowser.MAX_THUMBNAIL_WIDTH / size.width,
        DesktopBrowser.MAX_THUMBNAIL_HEIGHT / size.height
      );
      const resized = captured.resize({
        width: Math.max(1, Math.floor(size.width * scale)),
        height: Math.max(1, Math.floor(size.height * scale)),
        quality: "good",
      });
      const bytes = resized.toJPEG(60);
      if (bytes.byteLength > DesktopBrowser.MAX_THUMBNAIL_BYTES) return null;
      const { width, height } = resized.getSize();
      return DesktopBrowser.parseThumbnail({
        dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
        width,
        height,
      });
    } catch {
      return null;
    }
  }
  async openExternal(event: IpcMainInvokeEvent, raw: unknown): Promise<void> {
    const [, page] = this.#target(event, raw);
    if (page.state.url) await shell.openExternal(this.#url(page.state.url));
  }

  /** One explicit, native-confirmed operation for the shared browser profile. */
  async clearBrowsingData(
    event: IpcMainInvokeEvent,
    ...args: unknown[]
  ): Promise<boolean> {
    if (args.length) throw new Error("browser_request_invalid");
    const window = this.#managementWindow(event);
    if (this.#clearing) throw new Error("browser_session_busy");
    const sender = event.sender;
    const frame = event.senderFrame;
    if (!frame) throw new Error("browser_clear_expired");
    const href = frame.url;
    let current = true;
    const revoke = ipc_sender.watchNavigation(sender, () => {
      current = false;
    });
    const check = () => {
      if (
        !current ||
        this.#managementWindow(event) !== window ||
        sender.mainFrame !== frame ||
        frame.url !== href
      )
        throw new Error("browser_clear_expired");
    };
    try {
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        message: "Clear browsing data?",
        detail:
          "This clears browsing history, cookies, site storage, cache and website authentication for the built-in browser in all windows. All built-in browser tabs and popup windows will close, and you may need to sign in to websites again. Previously selected USB, HID or serial devices and accepted development certificates may require restarting Grida to fully reset.",
        buttons: ["Cancel", "Clear browsing data"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      check();
      if (result.response !== 1) return false;
      await this.#clearBrowser();
      return true;
    } finally {
      revoke();
    }
  }

  async #clearBrowser(): Promise<void> {
    if (this.#clearing) throw new Error("browser_session_busy");
    this.#clearing = true;
    this.#pendingAttach.clear();
    try {
      this.options.downloads?.cancelAll();
      this.#externalLinks.reset();
      for (const popup of this.#popups.values()) this.#forcePopup(popup);
      const closing: Promise<void>[] = [];
      for (const owner of this.#owners.values()) {
        for (const page of owner.pages.values())
          closing.push(this.#close(owner, page));
      }
      await Promise.all(closing);
      // Pages and owners leave their maps before native destruction finishes.
      // Drain closures that began before this clear, including retired owners.
      while (this.#closing.size) await Promise.all(this.#closing);
      await this.options.history?.clear();
      await this.#sitePolicy?.reset();
      const browserSession = this.#session();
      await browserSession.closeAllConnections();
      await browserSession.clearStorageData();
      await browserSession.clearCache();
      await browserSession.clearAuthCache();
      await BrowserLegacyProfiles.clear(browserSession.storagePath);
    } finally {
      this.#clearing = false;
      if (this.#pendingHistoryChange) {
        const change = this.#pendingHistoryChange;
        this.#pendingHistoryChange = null;
        this.#publishHistory(change);
      }
    }
  }

  /** Called when native account/entry admission is revoked. */
  closeAll(): void {
    this.#pendingAttach.clear();
    for (const owner of this.#owners.values()) this.#retire(owner);
  }

  #shell(event: IpcMainInvokeEvent): BrowserWindow {
    if (event.sender.isDestroyed()) throw new Error("browser_owner_invalid");
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      window.webContents !== event.sender ||
      event.senderFrame !== event.sender.mainFrame ||
      !this.options.admitWindow(window) ||
      !this.#workspace(event.senderFrame?.url)
    )
      throw new Error("browser_owner_invalid");
    return window;
  }
  #managementWindow(
    event: IpcMainInvokeEvent,
    expired = "browser_clear_expired"
  ): BrowserWindow {
    const sender = event.sender;
    if (sender.isDestroyed() || sender.isLoadingMainFrame())
      throw new Error(expired);
    const window = BrowserWindow.fromWebContents(sender);
    if (
      !window ||
      window.isDestroyed() ||
      window.webContents !== sender ||
      event.senderFrame !== sender.mainFrame ||
      !this.options.admitWindow(window)
    )
      throw new Error(expired);
    try {
      const url = new URL(event.senderFrame.url);
      if (
        url.origin !== this.options.editorOrigin ||
        !(
          url.pathname === "/desktop/settings" ||
          this.#workspace(event.senderFrame.url)
        )
      )
        throw new Error();
    } catch {
      throw new Error(expired);
    }
    return window;
  }
  #workspace(raw: string | undefined): string | null {
    try {
      const url = new URL(raw!);
      const id = url.searchParams.get("id");
      return url.origin === this.options.editorOrigin &&
        url.pathname === "/desktop/workspace" &&
        url.searchParams.getAll("id").length === 1 &&
        id &&
        /^[a-f0-9]{16}$/.test(id)
        ? id
        : null;
    } catch {
      return null;
    }
  }
  #attached(event: IpcMainInvokeEvent, attachmentId: unknown): Owner {
    this.#shell(event);
    const owner = this.#owners.get(event.sender.id);
    if (
      !owner ||
      typeof attachmentId !== "string" ||
      owner.attachmentId !== attachmentId ||
      owner.frame !== event.senderFrame ||
      owner.workspaceId !== this.#workspace(event.sender.getURL())
    )
      throw new Error("browser_attachment_expired");
    return owner;
  }
  #record(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw))
      throw new Error("browser_request_invalid");
    return raw as Record<string, unknown>;
  }
  #target(event: IpcMainInvokeEvent, raw: unknown): [Owner, Page] {
    const request = this.#record(raw);
    const owner = this.#attached(event, request.attachmentId);
    if (this.#clearing) throw new Error("browser_session_busy");
    const page =
      typeof request.pageId === "string" && owner.pages.get(request.pageId);
    if (!page) throw new Error("browser_page_unavailable");
    return [owner, page];
  }
  #guest(page: Page): WebContents {
    if (!page.guest || page.guest.isDestroyed())
      throw new Error("browser_guest_unavailable");
    return page.guest;
  }
  #url(raw: unknown): string {
    const url = DesktopBrowser.normalizeUrl(raw);
    if (!url) throw new Error("browser_url_invalid");
    return url;
  }
  #session(): Session {
    if (this.#browserSession) return this.#browserSession;
    const browserSession = session.fromPartition("persist:grida-browser");
    this.#sitePolicy = new BrowserSitePolicy(browserSession, {
      openExternal: (contents, request) =>
        this.#openApp(contents, request.url, false, request),
    });
    // Stock webview's built-in loadURL/src paths bypass will-navigate. Guard
    // actual top-level requests in the dedicated browser Session as well.
    // The trusted embedder still has Electron's built-in own-page scripting.
    browserSession.webRequest.onBeforeRequest(
      { urls: ["<all_urls>"] },
      (details, callback) => {
        const blocked =
          details.resourceType === "mainFrame" &&
          !this.#location(details.url) &&
          !BrowserExternalLinks.parse(details.url);
        callback({ cancel: blocked });
        if (!blocked) return;
        for (const owner of this.#owners.values()) {
          const page = [...owner.pages.values()].find(
            (candidate) => candidate.guest?.id === details.webContentsId
          );
          if (page) {
            page.state.failure = {
              kind: "navigation",
              code: "blocked",
              message: "This address cannot be opened in the browser.",
            };
            this.#changed(owner, page);
          }
        }
      }
    );
    browserSession.on("will-download", (event, item, contents) => {
      const site = this.#site(contents);
      if (!site || !this.options.downloads) {
        event.preventDefault();
        return;
      }
      this.options.downloads.accept(
        event,
        item,
        contents,
        site.window,
        site.live
      );
    });
    this.#browserSession = browserSession;
    return browserSession;
  }
  #load(owner: Owner, page: Page, url: string): void {
    page.favicon.clear();
    page.navigation++;
    page.rendered = false;
    page.state.url = url;
    page.state.failure = null;
    page.state.loading = page.guest !== null;
    this.#changed(owner, page);
    const httpReferrer = page.referrer;
    page.referrer = undefined;
    const loaded = httpReferrer
      ? page.guest?.loadURL(url, { httpReferrer })
      : page.guest?.loadURL(url);
    void loaded?.catch(() => {
      // did-fail-load supplies a bounded failure; replaced loads are normal.
    });
  }
  #observe(owner: Owner, page: Page, contents: WebContents): void {
    let documentVisit: {
      url: string;
      finished: boolean;
      token: symbol | null;
    } | null = null;
    const current = () =>
      owner.pages.get(page.state.id) === page &&
      page.guest === contents &&
      !contents.isDestroyed();
    const navigation = (
      event: { preventDefault(): void; isMainFrame?: boolean },
      url: string
    ) => {
      if (!current()) {
        event.preventDefault();
        return;
      }
      // Chromium validates the actual initiating frame/sandbox before the
      // Session openExternal request. Do not launch an app from this event.
      if (BrowserExternalLinks.parse(url)) return;
      if (event.isMainFrame === false) {
        try {
          if (
            ["http:", "https:", "about:", "blob:", "data:"].includes(
              new URL(url).protocol
            )
          )
            return;
        } catch {
          /* reject malformed subframe navigation */
        }
        event.preventDefault();
        return;
      }
      if (!this.#location(url)) {
        event.preventDefault();
        page.favicon.clear();
        page.state.failure = {
          kind: "navigation",
          code: "blocked",
          message: "This address cannot be opened in the browser.",
        };
        this.#changed(owner, page);
      }
    };
    this.#configureSite(
      owner,
      page,
      contents,
      owner.window,
      current,
      () => page.active
    );
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-navigate", navigation);
    contents.on("will-redirect", navigation);
    contents.on("will-frame-navigate", (details) =>
      navigation(details, details.url)
    );
    contents.on("did-start-navigation", (details) => {
      if (!current() || !details.isMainFrame) return;
      if (BrowserExternalLinks.parse(details.url)) return;
      if (!details.isSameDocument) documentVisit = null;
      // Some built-in loaders bypass Session.webRequest. This observational
      // event has no preexecution veto; contain unsupported private documents
      // after native unwind. Ordinary generated documents remain allowed.
      if (
        !details.isSameDocument &&
        !details.initiator &&
        !this.#location(details.url)
      ) {
        this.#rejectDocument(owner, page, contents);
        return;
      }
      page.navigation++;
      if (!details.isSameDocument) {
        page.favicon.clear();
        page.rendered = false;
      }
    });
    const refresh = () => {
      if (!current()) return;
      const rawUrl = contents.getURL();
      const url = this.#location(rawUrl);
      if (
        rawUrl &&
        !url &&
        !(page.state.url === null && rawUrl === "about:blank")
      ) {
        this.#rejectDocument(owner, page, contents);
        return;
      }
      if (url) page.state.url = url;
      page.state.loading = contents.isLoading();
      page.state.canGoBack = contents.navigationHistory.canGoBack();
      page.state.canGoForward = contents.navigationHistory.canGoForward();
      page.state.focused =
        page.active && owner.window.isFocused() && contents.isFocused();
      if (!page.state.loading && page.state.url && !page.state.failure)
        page.rendered = true;
      this.#changed(owner, page);
    };
    contents.on("did-start-loading", refresh);
    contents.on("did-stop-loading", () => {
      refresh();
      if (current() && !page.state.loading && !page.state.failure)
        page.favicon.ensure(contents.getURL());
    });
    contents.on("did-navigate", (_event, url, status) => {
      if (!current()) return;
      // Electron emits this only for a non-error full main-frame commit.
      // Wait for that commit: a started navigation can still fail or be kept
      // on the current document by beforeunload. HTTP error responses remain
      // ordinary website documents, unlike Chromium's network error pages.
      if (
        page.state.failure?.kind === "navigation" &&
        this.#live(owner) &&
        !this.#clearing &&
        this.#location(url) &&
        contents.getURL() === url
      )
        page.state.failure = null;
      documentVisit =
        status >= 200 &&
        status < 400 &&
        DesktopBrowser.normalizeUrl(url) === url
          ? { url, finished: false, token: null }
          : null;
      // Old-document icon events can be queued after navigation start while
      // getURL() still reports the old page. A full commit revokes them again.
      page.favicon.clear();
      refresh();
    });
    contents.on("did-finish-load", () => {
      if (
        !current() ||
        !this.#live(owner) ||
        this.#clearing ||
        !documentVisit ||
        documentVisit.finished ||
        contents.getURL() !== documentVisit.url
      )
        return;
      documentVisit.finished = true;
      documentVisit.token =
        this.options.history?.visit(
          documentVisit.url,
          this.#text(contents.getTitle(), DesktopBrowser.MAX_TITLE_BYTES) ||
            "Untitled"
        ) ?? null;
    });
    contents.on("did-navigate-in-page", (_event, url, isMainFrame) => {
      refresh();
      if (
        !current() ||
        !isMainFrame ||
        !documentVisit ||
        DesktopBrowser.normalizeUrl(url) !== url ||
        contents.getURL() !== url ||
        documentVisit.url === url
      )
        return;
      documentVisit.url = url;
      if (documentVisit.finished && this.#live(owner) && !this.#clearing)
        documentVisit.token =
          this.options.history?.visit(
            url,
            this.#text(contents.getTitle(), DesktopBrowser.MAX_TITLE_BYTES) ||
              "Untitled"
          ) ?? null;
    });
    contents.on("page-title-updated", (_event, title) => {
      if (!current()) return;
      page.state.title =
        this.#text(title, DesktopBrowser.MAX_TITLE_BYTES) || "Untitled";
      if (
        documentVisit?.finished &&
        documentVisit.token &&
        documentVisit.url === contents.getURL() &&
        this.#live(owner) &&
        !this.#clearing
      )
        this.options.history?.updateTitle(
          documentVisit.url,
          page.state.title,
          documentVisit.token
        );
      refresh();
    });
    contents.on("page-favicon-updated", (_event, candidates) => {
      if (current()) page.favicon.update(candidates, contents.getURL());
    });
    contents.on("focus", () => {
      if (!page.active) this.#blur(owner, page);
      refresh();
    });
    contents.on("blur", refresh);
    contents.on(
      "did-fail-load",
      (_event, code, _description, _url, isMainFrame) => {
        if (BrowserExternalLinks.parse(_url)) return;
        if (current() && isMainFrame) documentVisit = null;
        if (!current() || !isMainFrame || code === -3) return;
        page.favicon.clear();
        page.state.failure = {
          kind: "navigation",
          code: String(code),
          message:
            "The page could not be loaded. Check the address and try again.",
        };
        refresh();
      }
    );
    contents.on("render-process-gone", (_event, details) => {
      if (!current()) return;
      documentVisit = null;
      page.favicon.clear();
      page.rendered = false;
      page.state.loading = false;
      page.state.failure = {
        kind: "renderer-gone",
        code: this.#text(details.reason, 64),
        message: "The page stopped responding. Reload to try again.",
      };
      this.#blur(owner, page);
      this.#changed(owner, page);
    });
    contents.once("destroyed", () => {
      if (owner.pages.get(page.state.id) !== page || page.guest !== contents)
        return;
      page.favicon.clear();
      page.guest = null;
      if (owner.thumbnail?.page === page) owner.thumbnail = null;
      page.rendered = false;
      page.navigation++;
      this.#sitePolicy?.unregister(contents);
      Object.assign(page.state, {
        mounted: false,
        focused: false,
        loading: false,
        canGoBack: false,
        canGoForward: false,
        failure: {
          kind: "renderer-gone",
          code: "destroyed",
          message: "The page was closed. Reload to try again.",
        },
      });
      this.#changed(owner, page);
    });
    contents.on("before-input-event", (event, input) => {
      if (!current() || !this.#live(owner)) return;
      // CSS visibility does not reliably clear native guest focus. Inactive
      // pages must not consume even queued keyboard/composition events.
      if (!page.active) {
        event.preventDefault();
        return;
      }
      if (input.type !== "keyDown" || input.isAutoRepeat || input.isComposing)
        return;
      const key = input.key.toLowerCase();
      const modifier =
        process.platform === "darwin" ? input.meta : input.control;
      let command: string | undefined;
      if (modifier && !input.alt && !input.shift) {
        if (key === "l") command = "workspace.browser.focus-location";
        if (key === "t") command = "workspace.tabs.new";
        if (key === "w") command = "workspace.tabs.close-active";
        if (key === "r") {
          event.preventDefault();
          page.favicon.clear();
          page.navigation++;
          page.rendered = false;
          page.state.loading = true;
          page.state.failure = null;
          this.#changed(owner, page);
          contents.reload();
          return;
        }
      }
      if (input.control && key === "tab")
        command = input.shift
          ? "workspace.tabs.select-previous"
          : "workspace.tabs.select-next";
      if (
        modifier &&
        input.alt &&
        (key === "arrowleft" || key === "arrowright")
      )
        command =
          key === "arrowleft"
            ? "workspace.tabs.select-previous"
            : "workspace.tabs.select-next";
      if (command) {
        event.preventDefault();
        owner.shell.focus();
        owner.shell.send(IPC_CHANNELS.WORKSPACE_COMMAND, command);
      }
    });
  }
  #rejectDocument(owner: Owner, page: Page, contents: WebContents): void {
    if (page.guest !== contents) return;
    page.favicon.clear();
    page.guest = null;
    if (owner.thumbnail?.page === page) owner.thumbnail = null;
    page.active = false;
    page.rendered = false;
    page.navigation++;
    page.retiring.add(contents);
    contents.once("destroyed", () => page.retiring.delete(contents));
    this.#sitePolicy?.unregister(contents);
    Object.assign(page.state, {
      mounted: false,
      focused: false,
      loading: false,
      canGoBack: false,
      canGoForward: false,
      failure: {
        kind: "navigation",
        code: "blocked",
        message:
          "This address cannot be opened in the browser. Reload to return to the last allowed address.",
      },
    });
    this.#changed(owner, page);
    // Native callbacks must unwind before closing their guest. Trusted
    // embedder scripts already have own-page authority and may run transiently;
    // this is containment, not a universal preexecution barrier.
    setImmediate(() => {
      if (!contents.isDestroyed())
        contents.close({ waitForBeforeUnload: false });
    });
  }
  #openApp(
    contents: WebContents,
    url: string,
    trustedClick: boolean,
    source?: { origin: string; isCurrent(): boolean }
  ): void {
    const site = this.#site(contents);
    if (!site) return;
    const visible = () =>
      site.live() &&
      site.window.isVisible() &&
      (this.#popups.has(contents) || site.page.active);
    if (!visible()) return;
    void this.#externalLinks.open(url, {
      contents,
      parent: site.window,
      trustedClick,
      source,
      isLive: visible,
    });
  }
  #resourceNotice(owner: Owner): void {
    if (!this.#live(owner) || this.#resourceNotices.has(owner)) return;
    this.#resourceNotices.add(owner);
    void dialog
      .showMessageBox(owner.window, {
        type: "info",
        message: "Close a browser tab or window to open another",
        detail: "The built-in browser has reached its open page limit.",
        buttons: ["OK"],
      })
      .catch(() => {})
      .finally(() => this.#resourceNotices.delete(owner));
  }
  #openTab(
    owner: Owner,
    url: string,
    openerPageId: string | null,
    disposition: "foreground" | "background",
    referrer?: LoadURLOptions["httpReferrer"]
  ): boolean {
    if (!this.#live(owner) || this.#clearing) return false;
    if (owner.pages.size >= DesktopBrowser.MAX_PAGES) {
      this.#resourceNotice(owner);
      return false;
    }
    this.#create(owner, url, { openerPageId, disposition }, referrer);
    return true;
  }
  #location(raw: unknown): string | null {
    const parsed = DesktopBrowser.normalizeLocation(raw);
    if (parsed) return parsed;
    // Large generated documents are live Chromium contents, never persisted or
    // accepted by create/navigate/external/history APIs. Bound their display.
    if (
      typeof raw === "string" &&
      raw.startsWith("data:") &&
      raw.includes(",") &&
      !/[\p{Cc}\p{Cs}]/u.test(raw)
    )
      return "data:";
    return null;
  }
  #site(contents: WebContents): {
    owner: Owner;
    page: Page;
    window: BrowserWindow;
    live: () => boolean;
  } | null {
    const popup = this.#popups.get(contents);
    if (popup)
      return {
        owner: popup.owner,
        page: popup.openerPage,
        window: popup.window,
        live: () =>
          this.#live(popup.owner) &&
          this.#popups.get(contents) === popup &&
          !popup.window.isDestroyed() &&
          !contents.isDestroyed() &&
          !this.#clearing,
      };
    for (const owner of this.#owners.values())
      for (const page of owner.pages.values())
        if (page.guest === contents)
          return {
            owner,
            page,
            window: owner.window,
            live: () =>
              this.#live(owner) &&
              owner.pages.get(page.state.id) === page &&
              page.guest === contents &&
              !contents.isDestroyed() &&
              !this.#clearing,
          };
    return null;
  }
  /** Private preload intents are admitted by actual guest/frame, never app IPC. */
  guestLink(event: IpcMainEvent, raw: unknown): void {
    const site = this.#site(event.sender);
    if (!site || !site.live() || event.senderFrame !== event.sender.mainFrame)
      return;
    if (!this.#popups.has(event.sender) && !site.page.active) return;
    const request = this.#record(raw);
    if (
      Object.keys(request).some(
        (key) => !["url", "documentUrl", "disposition"].includes(key)
      ) ||
      request.documentUrl !== event.senderFrame.url ||
      request.documentUrl !== event.sender.getURL() ||
      !["foreground", "background"].includes(request.disposition as string)
    )
      return;
    const external = BrowserExternalLinks.parse(request.url);
    if (external) {
      this.#openApp(event.sender, external.url, true);
      return;
    }
    const url = DesktopBrowser.normalizeUrl(request.url);
    if (!url) return;
    this.#linkIntents.set(event.sender, {
      url,
      documentUrl: event.sender.getURL(),
      disposition: request.disposition as "foreground" | "background",
      expires: Date.now() + 1000,
    });
  }
  #configureSite(
    owner: Owner,
    openerPage: Page,
    contents: WebContents,
    parent: BrowserWindow,
    current: () => boolean,
    active: () => boolean
  ): void {
    const live = () =>
      current() &&
      this.#live(owner) &&
      !this.#clearing &&
      !parent.isDestroyed();
    this.#sitePolicy?.register(contents, {
      window: parent,
      isLive: live,
      isActive: active,
    });
    contents.on("did-start-navigation", (details) => {
      if (details.isMainFrame) this.#linkIntents.delete(contents);
    });
    contents.once("destroyed", () => this.#sitePolicy?.unregister(contents));
    const registerPopup = (window: BrowserWindow, disposition: string) => {
      const guest = window.webContents;
      if (!live() || guest.session !== this.#session() || this.#clearing) {
        window.destroy();
        return;
      }
      const popup: Popup = { window, contents: guest, owner, openerPage };
      this.#popups.set(guest, popup);
      const popupCurrent = () =>
        this.#popups.get(guest) === popup && !guest.isDestroyed();
      this.#configureSite(owner, openerPage, guest, window, popupCurrent, () =>
        window.isFocused()
      );
      guest.on("will-attach-webview", (event) => event.preventDefault());
      const guard = (event: { preventDefault(): void }, url: string) => {
        if (BrowserExternalLinks.parse(url)) return;
        if (!popupCurrent() || !this.#location(url)) event.preventDefault();
      };
      guest.on("will-navigate", guard);
      guest.on("will-redirect", guard);
      guest.on("will-frame-navigate", (event) => guard(event, event.url));
      const contain = (url: string) => {
        if (BrowserExternalLinks.parse(url)) return;
        if (!this.#location(url)) setImmediate(() => this.#forcePopup(popup));
      };
      guest.on("did-start-navigation", (event) => {
        if (event.isMainFrame) contain(event.url);
      });
      guest.on("did-navigate", (_event, url) => contain(url));
      let visited: { url: string; token: symbol | null } | null = null;
      guest.on("did-navigate", (_event, url, status) => {
        visited =
          status >= 200 &&
          status < 400 &&
          DesktopBrowser.normalizeUrl(url) === url
            ? { url, token: null }
            : null;
      });
      guest.on("did-finish-load", () => {
        if (
          visited &&
          popupCurrent() &&
          live() &&
          guest.getURL() === visited.url
        )
          visited.token =
            this.options.history?.visit(
              visited.url,
              this.#text(guest.getTitle(), DesktopBrowser.MAX_TITLE_BYTES) ||
                "Untitled"
            ) ?? null;
      });
      guest.on("page-title-updated", (_event, title) => {
        if (
          visited?.token &&
          popupCurrent() &&
          live() &&
          guest.getURL() === visited.url
        )
          this.options.history?.updateTitle(
            visited.url,
            this.#text(title, DesktopBrowser.MAX_TITLE_BYTES) || "Untitled",
            visited.token
          );
      });
      guest.on("did-start-navigation", (event) => {
        if (event.isMainFrame && !event.isSameDocument) visited = null;
      });
      guest.once("destroyed", () => this.#popups.delete(guest));
      window.once("closed", () => this.#popups.delete(guest));
      const retirePopup = () => this.#forcePopup(popup);
      contents.once("destroyed", retirePopup);
      contents.once("render-process-gone", retirePopup);
      guest.once("destroyed", () => {
        contents.off("destroyed", retirePopup);
        contents.off("render-process-gone", retirePopup);
      });
      if (disposition === "background-tab") window.showInactive();
      else window.show();
    };
    contents.setWindowOpenHandler((details) => {
      // Scripted external opens retain Chromium's native initiator/sandbox
      // evidence through the hardened factory and Session permission handler.
      if (
        !live() ||
        (!this.#location(details.url) &&
          !BrowserExternalLinks.parse(details.url))
      )
        return { action: "deny" };
      const intent = this.#linkIntents.get(contents);
      this.#linkIntents.delete(contents);
      if (
        intent &&
        intent.expires >= Date.now() &&
        intent.documentUrl === contents.getURL() &&
        intent.url === DesktopBrowser.normalizeUrl(details.url) &&
        !details.postBody
      ) {
        this.#openTab(
          owner,
          intent.url,
          openerPage.state.id,
          intent.disposition,
          details.referrer
        );
        return { action: "deny" };
      }
      if (this.#popups.size >= 64) {
        this.#resourceNotice(owner);
        return { action: "deny" };
      }
      // Let Chromium carry POST bodies, window names, opener and self-close.
      // No privileged application factory or caller-provided webPreferences.
      return {
        action: "allow",
        createWindow: (options) => {
          // Public createWindow requires passing its native options unchanged.
          // Its opaque optional webContents carries Chromium's existing opener,
          // POST and name state. Never replace or reload that supplied object.
          const supplied = (options as { webContents?: WebContents })
            .webContents;
          const window = new BrowserWindow(options);
          const guest = window.webContents;
          registerPopup(window, details.disposition);
          if (!supplied && this.#popups.has(guest)) {
            const post = details.postBody;
            void window
              .loadURL(details.url, {
                httpReferrer: details.referrer,
                ...(post && {
                  postData: post.data,
                  extraHeaders: `content-type: ${post.contentType}${post.boundary ? `; boundary=${post.boundary}` : ""}`,
                }),
              })
              .catch(() => {});
          }
          return guest;
        },
        overrideBrowserWindowOptions: {
          show: false,
          webPreferences: {
            session: this.#session(),
            preload: path.join(__dirname, "browser-guest-preload.js"),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            nodeIntegrationInSubFrames: false,
            nodeIntegrationInWorker: false,
            webviewTag: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            disableDialogs: false,
            safeDialogs: true,
            navigateOnDragDrop: true,
          },
        },
      };
    });
    contents.on("login", (event, details, auth, callback) => {
      event.preventDefault();
      const origin = DesktopBrowser.normalizeUrl(details.url);
      if (!live() || !origin) {
        callback();
        return;
      }
      let valid = true;
      const frame = contents.mainFrame;
      const authLive = () =>
        valid && live() && !frame.detached && contents.mainFrame === frame;
      const revoke = ipc_sender.watchNavigation(contents, () => {
        valid = false;
      });
      void BrowserAuthDialog.prompt({
        parent,
        contents,
        origin: auth.isProxy
          ? `${this.#text(auth.host, 512)}:${auth.port}`
          : new URL(origin).origin,
        realm: auth.realm,
        isProxy: auth.isProxy,
        isLive: authLive,
      })
        .then(
          (credentials) => {
            if (credentials && authLive())
              callback(credentials.username, credentials.password);
            else callback();
          },
          () => callback()
        )
        .finally(revoke);
    });
    contents.on("will-prevent-unload", (event) => {
      if (this.#permissionReloads.has(contents)) {
        event.preventDefault();
        return;
      }
      if (!live()) {
        event.preventDefault();
        return;
      }
      const response = dialog.showMessageBoxSync(parent, {
        type: "question",
        message: "Leave this page?",
        detail: "Changes you made may not be saved.",
        buttons: ["Stay", "Leave"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (response === 1 && live()) event.preventDefault();
    });
    const tools = () => new BrowserPageTools(contents, parent, live);
    contents.on("context-menu", (_event, params) => {
      if (!live()) return;
      const url = DesktopBrowser.normalizeUrl(params.linkURL);
      const template: Electron.MenuItemConstructorOptions[] = [];
      if (url)
        template.push(
          {
            label: "Open link in new tab",
            click: () => {
              if (live())
                this.#openTab(
                  owner,
                  url,
                  openerPage.state.id,
                  "foreground",
                  params.referrerPolicy
                );
            },
          },
          {
            label: "Open link in background tab",
            click: () => {
              if (live())
                this.#openTab(
                  owner,
                  url,
                  openerPage.state.id,
                  "background",
                  params.referrerPolicy
                );
            },
          },
          {
            label: "Open link in default browser",
            click: () => {
              if (live()) void shell.openExternal(url);
            },
          },
          { type: "separator" }
        );
      if (params.isEditable)
        template.push(
          { role: "undo" },
          { role: "redo" },
          { type: "separator" },
          { role: "cut" },
          { role: "copy" },
          { role: "paste" },
          { role: "selectAll" },
          { type: "separator" }
        );
      else if (params.selectionText)
        template.push({ role: "copy" }, { type: "separator" });
      template.push(
        {
          label: "Find in page…",
          click: () => {
            if (!live()) return;
            if (this.#popups.has(contents))
              BrowserFindDialog.open(parent, contents, live);
            else {
              owner.shell.focus();
              owner.shell.send(
                IPC_CHANNELS.WORKSPACE_COMMAND,
                "workspace.browser.find"
              );
            }
          },
        },
        {
          label: "Reload",
          click: () => {
            if (live()) contents.reload();
          },
        },
        {
          label: "Print…",
          click: () => {
            void tools()
              .print()
              .catch(() => {});
          },
        },
        {
          label: "Zoom in",
          click: () => {
            if (live())
              contents.setZoomFactor(
                Math.min(5, contents.getZoomFactor() * 1.2)
              );
          },
        },
        {
          label: "Zoom out",
          click: () => {
            if (live())
              contents.setZoomFactor(
                Math.max(0.25, contents.getZoomFactor() / 1.2)
              );
          },
        },
        {
          label: "Actual size",
          click: () => {
            if (live()) contents.setZoomFactor(1);
          },
        },
        {
          label: "Inspect",
          click: () => {
            if (live()) contents.inspectElement(params.x, params.y);
          },
        }
      );
      Menu.buildFromTemplate(template).popup({ window: parent });
    });
    contents.on("before-input-event", (event, input) => {
      if (
        !live() ||
        !active() ||
        input.type !== "keyDown" ||
        input.isComposing ||
        input.isAutoRepeat
      )
        return;
      const modifier =
        process.platform === "darwin" ? input.meta : input.control;
      const key = input.key.toLowerCase();
      if (!modifier) return;
      if (
        key === "w" &&
        !input.alt &&
        !input.shift &&
        this.#popups.has(contents)
      ) {
        event.preventDefault();
        parent.close();
        return;
      }
      if (["+", "=", "-", "0"].includes(key) && !input.alt) {
        event.preventDefault();
        contents.setZoomFactor(
          key === "0"
            ? 1
            : Math.max(
                0.25,
                Math.min(
                  5,
                  contents.getZoomFactor() * (key === "-" ? 1 / 1.2 : 1.2)
                )
              )
        );
      }
      if (key === "p" && !input.alt && !input.shift) {
        event.preventDefault();
        void tools()
          .print()
          .catch(() => {});
      }
      if (
        key === "i" &&
        (process.platform === "darwin" ? input.alt : input.shift)
      ) {
        event.preventDefault();
        tools().inspect();
      }
      if (key === "f" && this.#popups.has(contents)) {
        event.preventDefault();
        BrowserFindDialog.open(parent, contents, live);
        return;
      }
      if ((key === "f" || key === "g") && !this.#popups.has(contents)) {
        event.preventDefault();
        owner.shell.focus();
        owner.shell.send(
          IPC_CHANNELS.WORKSPACE_COMMAND,
          key === "f"
            ? "workspace.browser.find"
            : input.shift
              ? "workspace.browser.find-previous"
              : "workspace.browser.find-next"
        );
      }
    });
  }
  #reloadPermissions(contents: WebContents): Promise<void> {
    if (contents.isDestroyed()) return Promise.resolve();
    // Reset must end existing streams even when the old document has a beforeunload
    // handler. This explicit reset differs from ordinary user navigation.
    this.#permissionReloads.add(contents);
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const cleanup = () => {
        clearTimeout(timer);
        this.#permissionReloads.delete(contents);
        contents.off("did-navigate", retired);
        contents.off("destroyed", retired);
      };
      const retired = () => {
        cleanup();
        resolve();
      };
      const forceClose = () => {
        // A provisional failure, cancellation or stalled response can leave the
        // old document alive. Once closing, only destruction confirms retirement.
        clearTimeout(timer);
        contents.off("did-navigate", retired);
        timer = setTimeout(() => {
          cleanup();
          reject(new Error("browser_permission_close_timeout"));
        }, PERMISSION_CLOSE_TIMEOUT_MS);
        try {
          contents.close({ waitForBeforeUnload: false });
        } catch (error) {
          cleanup();
          reject(error);
        }
      };
      contents.once("did-navigate", retired);
      contents.once("destroyed", retired);
      timer = setTimeout(forceClose, PERMISSION_RELOAD_TIMEOUT_MS);
      try {
        contents.reload();
      } catch {
        forceClose();
      }
    });
  }
  #forcePopup(popup: Popup): void {
    this.#popups.delete(popup.contents);
    this.#sitePolicy?.unregister(popup.contents);
    if (!popup.window.isDestroyed()) popup.window.destroy();
  }
  #ordinaryClose(contents: WebContents): Promise<boolean> {
    if (contents.isDestroyed()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (closed: boolean) => {
        contents.off("destroyed", destroyed);
        contents.off("will-prevent-unload", prevented);
        resolve(closed);
      };
      const destroyed = () => finish(true);
      const prevented = (event: { defaultPrevented: boolean }) => {
        if (!event.defaultPrevented) finish(false);
      };
      contents.once("destroyed", destroyed);
      contents.on("will-prevent-unload", prevented);
      contents.close({ waitForBeforeUnload: true });
    });
  }
  #tools(event: IpcMainInvokeEvent, raw: unknown): BrowserPageTools {
    const [owner, page] = this.#target(event, raw);
    const guest = this.#guest(page);
    return new BrowserPageTools(
      guest,
      owner.window,
      () =>
        this.#live(owner) &&
        owner.pages.get(page.state.id) === page &&
        page.guest === guest &&
        !this.#clearing
    );
  }
  find(event: IpcMainInvokeEvent, raw: unknown) {
    const request = DesktopBrowser.Utilities.parseFind(raw);
    if (!request) throw new Error("browser_find_invalid");
    return this.#tools(event, request).find(request);
  }
  stopFind(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#tools(event, raw).stopFind();
  }
  getZoom(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#tools(event, raw).getZoom();
  }
  setZoom(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#tools(event, raw).setZoom(raw);
  }
  print(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#tools(event, raw).print();
  }
  inspect(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#tools(event, raw).inspect();
  }
  async #manage<T>(
    event: IpcMainInvokeEvent,
    operation: (window: BrowserWindow, check: () => void) => T | Promise<T>
  ): Promise<T> {
    const window = this.#managementWindow(event);
    const frame = event.senderFrame;
    const href = frame?.url;
    let current = true;
    const revoke = ipc_sender.watchNavigation(event.sender, () => {
      current = false;
    });
    const check = () => {
      if (
        !current ||
        this.#clearing ||
        event.senderFrame !== frame ||
        frame?.url !== href ||
        this.#managementWindow(event) !== window
      )
        throw new Error("browser_management_expired");
    };
    try {
      check();
      const result = await operation(window, check);
      check();
      return result;
    } finally {
      revoke();
    }
  }
  clearHistory(event: IpcMainInvokeEvent) {
    return this.#manage(event, async (_window, check) => {
      if (!this.options.history) throw new Error("browser_history_unavailable");
      check();
      await this.options.history.clear(check);
      return true;
    });
  }
  clearCache(event: IpcMainInvokeEvent) {
    return this.#manage(event, async () => {
      await this.#session().clearCache();
      return true;
    });
  }
  resetPermissions(event: IpcMainInvokeEvent) {
    return this.#manage(event, async (window, check) => {
      check();
      if (this.#resettingPermissions) throw new Error("browser_session_busy");
      this.#session();
      this.#resettingPermissions = true;
      try {
        this.#externalLinks.reset();
        // Policy clears consent before awaiting connection cleanup. Start guest
        // retirement immediately and finish it even if that cleanup fails.
        const reset = this.#sitePolicy!.resetPermissions();
        const guests = new Set<WebContents>();
        for (const owner of this.#owners.values())
          for (const page of owner.pages.values())
            if (page.guest && !page.guest.isDestroyed()) guests.add(page.guest);
        for (const popup of this.#popups.values())
          if (!popup.contents.isDestroyed()) guests.add(popup.contents);
        const [result, ...retirements] = await Promise.allSettled([
          reset,
          ...[...guests].map((guest) => this.#reloadPermissions(guest)),
        ]);
        if (result.status === "rejected") throw result.reason;
        for (const retirement of retirements) {
          if (retirement.status === "rejected") throw retirement.reason;
        }
        if (
          result.value.certificateRestartRequired ||
          result.value.deviceRestartRequired
        ) {
          const options: Electron.MessageBoxOptions = {
            type: "info",
            message: "Restart Grida to finish resetting website permissions",
            detail:
              "Website consent choices were cleared. Open pages were reloaded or closed. Chromium may retain previously selected USB, HID or serial devices and accepted certificates until Grida restarts.",
            buttons: ["OK"],
          };
          await (window.isDestroyed() || window.webContents.isDestroyed()
            ? dialog.showMessageBox(options)
            : dialog.showMessageBox(window, options));
        }
        return true;
      } finally {
        this.#resettingPermissions = false;
      }
    });
  }
  downloadPreferences(event: IpcMainInvokeEvent) {
    return this.#manage(event, () => {
      if (!this.options.downloads)
        throw new Error("browser_downloads_unavailable");
      return this.options.downloads.preferences();
    });
  }
  setDownloadPrompt(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#manage(event, (_window, check) => {
      if (!this.options.downloads)
        throw new Error("browser_downloads_unavailable");
      return this.options.downloads.setPrompt(raw, check);
    });
  }
  chooseDownloadDirectory(event: IpcMainInvokeEvent) {
    return this.#manage(event, (window, check) => {
      if (!this.options.downloads)
        throw new Error("browser_downloads_unavailable");
      return this.options.downloads.chooseDirectory(window, check);
    });
  }
  openPage(event: IpcMainInvokeEvent, raw: unknown) {
    return this.#manage(event, (_window, check) => {
      const request = DesktopBrowser.Management.parseOpenPage(raw);
      if (!request) throw new Error("browser_url_invalid");
      check();
      const owner = [...this.#owners.values()].find((candidate) =>
        this.#live(candidate)
      );
      if (!owner) return false;
      if (!this.#openTab(owner, request.url, null, "foreground")) return false;
      owner.window.show();
      owner.window.focus();
      return true;
    });
  }

  #watchOwner(owner: Owner): void {
    const retire = () => this.#retire(owner);
    const navigating = (details: {
      isMainFrame: boolean;
      isSameDocument: boolean;
    }) => {
      if (details.isMainFrame && !details.isSameDocument) retire();
    };
    const inPage = (_event: unknown, url: string, isMainFrame: boolean) => {
      if (isMainFrame && this.#workspace(url) !== owner.workspaceId) retire();
    };
    const failed = (
      _event: unknown,
      _code: number,
      _description: string,
      _url: string,
      isMainFrame: boolean
    ) => {
      if (isMainFrame) retire();
    };
    const focus = () => {
      if (!this.#live(owner)) return;
      for (const page of owner.pages.values()) {
        page.state.focused =
          !!page.guest &&
          !page.guest.isDestroyed() &&
          page.active &&
          owner.window.isFocused() &&
          page.guest.isFocused();
        this.#changed(owner, page);
      }
    };
    owner.window.once("closed", retire);
    owner.shell.on("did-start-navigation", navigating);
    // A late attach may have missed navigation's start; successful commits and
    // error documents must end that document's guests as well.
    owner.shell.on("did-navigate", retire);
    owner.shell.on("did-fail-provisional-load", failed);
    owner.shell.on("did-fail-load", failed);
    owner.shell.on("did-navigate-in-page", inPage);
    owner.shell.once("render-process-gone", retire);
    owner.shell.once("destroyed", retire);
    owner.window.on("focus", focus);
    owner.window.on("blur", focus);
    owner.disposers.push(() => {
      owner.window.off("closed", retire);
      owner.shell.off("did-start-navigation", navigating);
      owner.shell.off("did-navigate", retire);
      owner.shell.off("did-fail-provisional-load", failed);
      owner.shell.off("did-fail-load", failed);
      owner.shell.off("did-navigate-in-page", inPage);
      owner.shell.off("render-process-gone", retire);
      owner.shell.off("destroyed", retire);
      owner.window.off("focus", focus);
      owner.window.off("blur", focus);
    });
  }
  #mountLive(mount: Mount): boolean {
    return (
      this.#live(mount.owner) &&
      mount.owner.attachmentId === mount.attachmentId &&
      mount.owner.frame === mount.frame &&
      mount.owner.pages.get(mount.page.state.id) === mount.page &&
      mount.page.mount === mount &&
      !mount.page.guest &&
      !this.#clearing
    );
  }
  #forgetMount(mount: Mount): void {
    clearTimeout(mount.timer);
    if (this.#mounts.get(mount.src) === mount) this.#mounts.delete(mount.src);
    if (
      mount.consumed &&
      !mount.guest &&
      !mount.owner.shell.isDestroyed() &&
      this.#acceptedMounts.get(mount.owner.shellId) === mount
    ) {
      // Stock Electron creates the guest synchronously after will-attach.
      // Fail closed if that ordering ever changes: do not let an old delayed
      // creation claim a newer ticket. Closing this shell releases the slot.
      if (!mount.releaseTombstone) {
        mount.releaseTombstone = () => this.#releaseAccepted(mount);
        mount.owner.shell.once("destroyed", mount.releaseTombstone);
      }
    } else this.#releaseAccepted(mount);
    if (mount.page.mount === mount) mount.page.mount = null;
  }
  #releaseAccepted(mount: Mount): void {
    if (this.#acceptedMounts.get(mount.owner.shellId) === mount)
      this.#acceptedMounts.delete(mount.owner.shellId);
    if (mount.releaseTombstone) {
      mount.owner.shell.off("destroyed", mount.releaseTombstone);
      mount.releaseTombstone = null;
    }
  }
  #safeGuest(guest: WebContents, mount: Mount): boolean {
    // Fixed preferences were enforced before native creation. Electron's
    // legacy preference-inspection helper is not a public typed API; admission
    // rechecks the actual public guest/host/Session and document identities.
    return (
      mount.guest === guest &&
      !guest.isDestroyed() &&
      guest.getType() === "webview" &&
      guest.hostWebContents === mount.owner.shell &&
      guest.session === mount.page.browserSession &&
      this.#mountLive(mount)
    );
  }
  #failMount(mount: Mount, code = "timeout"): void {
    const live = this.#mountLive(mount);
    this.#forgetMount(mount);
    if (mount.guest && !mount.guest.isDestroyed())
      mount.guest.close({ waitForBeforeUnload: false });
    if (!live) return;
    mount.page.state.failure = {
      kind: "mount",
      code,
      message: "The browser page could not be mounted. Reload to try again.",
    };
    this.#changed(mount.owner, mount.page);
  }
  #blur(owner: Owner, page: Page): void {
    if (
      page.guest &&
      !page.guest.isDestroyed() &&
      page.guest.isFocused() &&
      !owner.shell.isDestroyed() &&
      !owner.window.isDestroyed()
    )
      owner.shell.focus();
    if (page.state.focused) {
      page.state.focused = false;
      this.#changed(owner, page);
    }
  }
  #changed(owner: Owner, page: Page): void {
    if (owner.pages.get(page.state.id) !== page) return;
    if (page.state.focused) {
      for (const other of owner.pages.values())
        if (other !== page && other.state.focused) {
          other.state.focused = false;
          this.#changed(owner, other);
        }
    }
    page.state.revision = ++owner.revision;
    if (this.#live(owner))
      owner.shell.send(IPC_CHANNELS.BROWSER_CHANGED, {
        type: "changed",
        attachmentId: owner.attachmentId!,
        revision: owner.revision,
        page: { ...page.state },
      } satisfies DesktopBrowser.Event);
  }
  #live(owner: Owner): boolean {
    return (
      this.#owners.get(owner.shellId) === owner &&
      owner.attachmentId !== null &&
      !owner.shell.isDestroyed() &&
      !owner.window.isDestroyed() &&
      this.options.admitWindow(owner.window) &&
      owner.frame === owner.shell.mainFrame &&
      owner.workspaceId === this.#workspace(owner.shell.getURL())
    );
  }
  #snapshot(owner: Owner): DesktopBrowser.Snapshot {
    return {
      version: DesktopBrowser.VERSION,
      attachmentId: owner.attachmentId!,
      revision: owner.revision,
      pages: [...owner.pages.values()].map((page) => ({ ...page.state })),
    };
  }
  #close(owner: Owner, page: Page): Promise<void> {
    const closing = this.#closePage(owner, page);
    this.#closing.add(closing);
    void closing.then(
      () => this.#closing.delete(closing),
      () => this.#closing.delete(closing)
    );
    return closing;
  }
  async #closePage(owner: Owner, page: Page): Promise<void> {
    if (!owner.pages.delete(page.state.id)) return;
    page.favicon.clear();
    if (owner.thumbnail?.page === page) owner.thumbnail = null;

    this.#blur(owner, page);
    const guests = new Set<WebContents>();
    for (const contents of page.retiring) guests.add(contents);
    if (page.guest) guests.add(page.guest);
    if (page.mount?.guest) guests.add(page.mount.guest);
    if (page.mount) this.#forgetMount(page.mount);
    page.guest = null;
    const destroyed = [...guests].map((contents) => {
      if (contents.isDestroyed()) return Promise.resolve();
      this.#sitePolicy?.unregister(contents);
      const result = new Promise<void>((resolve) =>
        contents.once("destroyed", () => resolve())
      );
      contents.close({ waitForBeforeUnload: false });
      return result;
    });
    owner.revision++;
    if (this.#live(owner))
      owner.shell.send(IPC_CHANNELS.BROWSER_CHANGED, {
        type: "closed",
        attachmentId: owner.attachmentId!,
        revision: owner.revision,
        pageId: page.state.id,
      } satisfies DesktopBrowser.Event);
    await Promise.all(destroyed);
  }
  async #destroy(owner: Owner): Promise<void> {
    for (const popup of this.#popups.values())
      if (popup.owner === owner) this.#forcePopup(popup);
    owner.attachmentId = null;
    owner.frame = null;
    if (this.#owners.get(owner.shellId) === owner)
      this.#owners.delete(owner.shellId);
    for (const dispose of owner.disposers.splice(0)) dispose();
    await Promise.all(
      [...owner.pages.values()].map((page) => this.#close(owner, page))
    );
  }
  #retire(owner: Owner): void {
    void this.#destroy(owner).catch(() =>
      console.warn("[grida] browser session cleanup failed")
    );
  }
  #text(raw: string, maxBytes: number): string {
    let text = "";
    let bytes = 0;
    for (const character of raw) {
      if (/[\p{Cc}\p{Cs}]/u.test(character)) continue;
      const size = Buffer.byteLength(character);
      if (bytes + size > maxBytes) break;
      text += character;
      bytes += size;
    }
    return text;
  }
}
