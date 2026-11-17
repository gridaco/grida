/**
 * GRIDA-SEC-016 — Main admits actual DOM guests and owns their isolated sessions.
 * Guest contents never inherit the application's preload, cookies or authority.
 */
import {
  BrowserWindow,
  dialog,
  session,
  shell,
  type IpcMainInvokeEvent,
  type DownloadItem,
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

type Page = {
  guest: WebContents | null;
  retiring: Set<WebContents>;
  browserSession: Session;
  mount: Mount | null;
  active: boolean;
  rendered: boolean;
  state: { -readonly [K in keyof DesktopBrowser.Page]: DesktopBrowser.Page[K] };
  downloads: Set<DownloadItem>;
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

/** Browser execution and document-scoped guest admission, independent of agents. */
export class DesktopBrowserHost {
  readonly #owners = new Map<number, Owner>();
  readonly #sessions = new Map<string, Session>();
  readonly #clearing = new Set<string>();
  readonly #pendingAttach = new Map<number, symbol>();
  readonly #mounts = new Map<string, Mount>();
  readonly #acceptedMounts = new Map<number, Mount>();

  constructor(
    readonly options: {
      editorOrigin: string;
      admitWindow(window: BrowserWindow): boolean;
      workspaceExists(workspaceId: string): Promise<boolean>;
      resolveWorkspace?(
        workspaceId: string
      ): Promise<Readonly<{ name: string; root?: string }> | null>;
    }
  ) {}

  async attach(
    event: IpcMainInvokeEvent,
    workspaceId: unknown
  ): Promise<DesktopBrowser.Snapshot> {
    const window = this.#shell(event);
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
        this.#clearing.has(workspaceId)
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
    if (this.#clearing.has(owner.workspaceId))
      throw new Error("browser_session_busy");
    if (owner.pages.size >= DesktopBrowser.MAX_PAGES)
      throw new Error("browser_page_limit");
    if (!DesktopBrowser.isStorageScope(request.storageScope))
      throw new Error("browser_storage_invalid");
    const url = request.url === undefined ? null : this.#url(request.url);
    const id = randomUUID();
    const scope = request.storageScope;
    const page: Page = {
      guest: null,
      retiring: new Set(),
      browserSession: this.#session(
        scope === "workspace" ? owner.workspaceId : id,
        scope === "workspace"
      ),
      mount: null,
      active: false,
      rendered: false,
      downloads: new Set(),
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
        storageScope: scope,
        failure: null,
      },
    };
    owner.pages.set(id, page);
    this.#changed(owner, page);
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
      disableDialogs: true,
      safeDialogs: true,
      // Additional stock-runtime hardening; the public window-open handler
      // installed before website load is the authoritative popup policy.
      disablePopups: true,
      navigateOnDragDrop: false,
      backgroundThrottling: true,
    });
    // Electron otherwise loadURLs this source before did-attach-webview fires.
    // No website request may precede actual guest registration and its guards.
    delete params.src;
    delete params.httpreferrer;
    delete params.useragent;
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
    if (page.state.url) this.#load(owner, page, this.#url(page.state.url));
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
  close(event: IpcMainInvokeEvent, raw: unknown): Promise<void> {
    const [owner, page] = this.#target(event, raw);
    return this.#close(owner, page);
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

  async clearSession(event: IpcMainInvokeEvent, raw: unknown): Promise<void> {
    const request = this.#record(raw);
    const owner = this.#attached(event, request.attachmentId);
    await this.#clearWorkspace(owner.workspaceId);
  }

  /** Settings clears only the catalog identity named in Main's confirmation. */
  async clearWorkspaceData(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): Promise<boolean> {
    const request = this.#record(raw);
    if (
      Object.keys(request).length !== 1 ||
      typeof request.workspaceId !== "string" ||
      !/^[a-f0-9]{16}$/.test(request.workspaceId)
    )
      throw new Error("browser_workspace_invalid");
    const window = this.#settingsWindow(event);
    const sender = event.sender;
    const frame = event.senderFrame;
    if (!frame) throw new Error("browser_settings_expired");
    const href = frame.url;
    let current = true;
    const revoke = ipc_sender.watchNavigation(sender, () => {
      current = false;
    });
    const check = () => {
      if (
        !current ||
        this.#settingsWindow(event) !== window ||
        sender.mainFrame !== frame ||
        frame.url !== href
      )
        throw new Error("browser_settings_expired");
    };
    try {
      const resolveWorkspace = this.options.resolveWorkspace;
      if (!resolveWorkspace) throw new Error("browser_workspace_unavailable");
      const workspaceId = request.workspaceId;
      const workspace = await resolveWorkspace(workspaceId);
      check();
      if (!workspace || typeof workspace.name !== "string")
        throw new Error("browser_workspace_unavailable");
      const confirmedName = workspace.name;
      const confirmedRoot = workspace.root ?? null;
      const name = this.#text(confirmedName, 256) || "this workspace";
      const result = await dialog.showMessageBox(window, {
        type: "warning",
        message: "Clear website data?",
        detail: `This clears cookies, site storage, cache and website authentication for “${name}”. Its browser tabs will close, and you may need to sign in to websites again.${confirmedRoot ? `\n\nWorkspace: ${this.#text(confirmedRoot, 4096)}` : ""}`,
        buttons: ["Cancel", "Clear website data"],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      check();
      if (result.response !== 1) return false;
      const latest = await resolveWorkspace(workspaceId);
      check();
      if (
        !latest ||
        latest.name !== confirmedName ||
        (latest.root ?? null) !== confirmedRoot
      )
        throw new Error("browser_workspace_changed");
      await this.#clearWorkspace(workspaceId);
      return true;
    } finally {
      revoke();
    }
  }

  async #clearWorkspace(workspaceId: string): Promise<void> {
    if (this.#clearing.has(workspaceId))
      throw new Error("browser_session_busy");
    this.#clearing.add(workspaceId);
    try {
      const closing: Promise<void>[] = [];
      // Every window sharing this partition loses its pages before storage is cleared.
      for (const other of this.#owners.values()) {
        if (other.workspaceId === workspaceId) {
          for (const page of other.pages.values())
            closing.push(this.#close(other, page));
        }
      }
      await Promise.all(closing);
      const browserSession = this.#session(workspaceId, true);
      {
        await browserSession.closeAllConnections();
        await browserSession.clearStorageData();
        await browserSession.clearCache();
        await browserSession.clearAuthCache();
      }
    } finally {
      this.#clearing.delete(workspaceId);
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
  #settingsWindow(event: IpcMainInvokeEvent): BrowserWindow {
    const sender = event.sender;
    if (sender.isDestroyed() || sender.isLoadingMainFrame())
      throw new Error("browser_settings_expired");
    const window = BrowserWindow.fromWebContents(sender);
    if (
      !window ||
      window.isDestroyed() ||
      window.webContents !== sender ||
      event.senderFrame !== sender.mainFrame ||
      !this.options.admitWindow(window)
    )
      throw new Error("browser_settings_expired");
    try {
      const url = new URL(event.senderFrame.url);
      if (
        url.origin !== this.options.editorOrigin ||
        url.pathname !== "/desktop/settings"
      )
        throw new Error();
    } catch {
      throw new Error("browser_settings_expired");
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
    if (this.#clearing.has(owner.workspaceId))
      throw new Error("browser_session_busy");
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
  #session(id: string, persistent: boolean): Session {
    const key = persistent
      ? `persist:grida-browser-workspace-${id}`
      : `grida-browser-page-${id}`;
    const existing = this.#sessions.get(key);
    if (existing) return existing;
    const browserSession = session.fromPartition(key);
    browserSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false)
    );
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setDevicePermissionHandler(() => false);
    // Stock webview's built-in loadURL/src paths bypass will-navigate. Guard
    // actual top-level requests in the dedicated browser Session as well.
    // The trusted embedder still has Electron's built-in own-page scripting.
    browserSession.webRequest.onBeforeRequest(
      { urls: ["<all_urls>"] },
      (details, callback) => {
        const blocked =
          details.resourceType === "mainFrame" &&
          !DesktopBrowser.normalizeUrl(details.url);
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
      const owner = this.#owners
        .values()
        .find((candidate) =>
          [...candidate.pages.values()].some((page) => page.guest === contents)
        );
      if (!owner || !this.#live(owner)) {
        event.preventDefault();
        return;
      }
      const page = [...owner.pages.values()].find(
        (candidate) => candidate.guest === contents
      )!;
      const attachmentId = owner.attachmentId;
      const destination = dialog.showSaveDialogSync(owner.window, {
        title: "Save browser download",
        defaultPath: path.basename(item.getFilename()),
      });
      if (
        !destination ||
        !this.#live(owner) ||
        owner.attachmentId !== attachmentId ||
        owner.pages.get(page.state.id) !== page ||
        page.guest !== contents ||
        contents.isDestroyed()
      ) {
        event.preventDefault();
        return;
      }
      item.setSavePath(destination);
      page.downloads.add(item);
      item.once("done", () => page.downloads.delete(item));
    });
    this.#sessions.set(key, browserSession);
    return browserSession;
  }
  #load(owner: Owner, page: Page, url: string): void {
    page.navigation++;
    page.rendered = false;
    page.state.url = url;
    page.state.failure = null;
    page.state.loading = page.guest !== null;
    this.#changed(owner, page);
    void page.guest?.loadURL(url).catch(() => {
      // did-fail-load supplies a bounded failure; replaced loads are normal.
    });
  }
  #observe(owner: Owner, page: Page, contents: WebContents): void {
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
      if (!DesktopBrowser.normalizeUrl(url)) {
        event.preventDefault();
        page.state.failure = {
          kind: "navigation",
          code: "blocked",
          message: "This address cannot be opened in the browser.",
        };
        this.#changed(owner, page);
      }
    };
    contents.setWindowOpenHandler(() => ({ action: "deny" }));
    contents.on("will-attach-webview", (event) => event.preventDefault());
    contents.on("will-navigate", navigation);
    contents.on("will-redirect", navigation);
    contents.on("will-frame-navigate", (details) =>
      navigation(details, details.url)
    );
    contents.on("login", (event, _details, _auth, callback) => {
      event.preventDefault();
      callback();
    });
    contents.on("will-prevent-unload", (event) => event.preventDefault());
    contents.on("did-start-navigation", (details) => {
      if (!current() || !details.isMainFrame) return;
      // Blob loaders bypass Session.webRequest. The observational start event
      // has no preexecution veto; revoke programmatic unsupported documents
      // and close in a safe later task. Frame-initiated links use the
      // cancellable navigation hooks; commit observation is a final fallback.
      if (
        !details.isSameDocument &&
        !details.initiator &&
        !DesktopBrowser.normalizeUrl(details.url)
      ) {
        this.#rejectDocument(owner, page, contents);
        return;
      }
      page.navigation++;
      if (!details.isSameDocument) page.rendered = false;
    });
    const refresh = () => {
      if (!current()) return;
      const rawUrl = contents.getURL();
      const url = DesktopBrowser.normalizeUrl(rawUrl);
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
    contents.on("did-stop-loading", refresh);
    contents.on("did-navigate", refresh);
    contents.on("did-navigate-in-page", refresh);
    contents.on("page-title-updated", (_event, title) => {
      if (!current()) return;
      page.state.title =
        this.#text(title, DesktopBrowser.MAX_TITLE_BYTES) || "Untitled";
      refresh();
    });
    contents.on("focus", () => {
      if (!page.active) this.#blur(owner, page);
      refresh();
    });
    contents.on("blur", refresh);
    contents.on(
      "did-fail-load",
      (_event, code, _description, _url, isMainFrame) => {
        if (!current() || !isMainFrame || code === -3) return;
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
      page.guest = null;
      if (owner.thumbnail?.page === page) owner.thumbnail = null;
      page.rendered = false;
      page.navigation++;
      this.#cancelDownloads(page);
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
        if (key === "t") command = "workspace.browser.new";
        if (key === "w") command = "workspace.tabs.close-active";
        if (key === "r") {
          event.preventDefault();
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
    page.guest = null;
    if (owner.thumbnail?.page === page) owner.thumbnail = null;
    page.active = false;
    page.rendered = false;
    page.navigation++;
    page.retiring.add(contents);
    contents.once("destroyed", () => page.retiring.delete(contents));
    this.#cancelDownloads(page);
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
      !this.#clearing.has(mount.owner.workspaceId)
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
  async #close(owner: Owner, page: Page): Promise<void> {
    if (!owner.pages.delete(page.state.id)) return;
    if (owner.thumbnail?.page === page) owner.thumbnail = null;
    this.#cancelDownloads(page);
    this.#blur(owner, page);
    const guests = new Set<WebContents>();
    for (const contents of page.retiring) guests.add(contents);
    if (page.guest) guests.add(page.guest);
    if (page.mount?.guest) guests.add(page.mount.guest);
    if (page.mount) this.#forgetMount(page.mount);
    page.guest = null;
    const destroyed = [...guests].map((contents) => {
      if (contents.isDestroyed()) return Promise.resolve();
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
    if (page.state.storageScope === "ephemeral") {
      this.#sessions.delete(`grida-browser-page-${page.state.id}`);
      try {
        await Promise.all([
          page.browserSession.closeAllConnections(),
          page.browserSession.clearStorageData(),
          page.browserSession.clearCache(),
          page.browserSession.clearAuthCache(),
        ]);
      } catch {
        throw new Error("browser_session_cleanup_failed");
      }
    }
  }
  async #destroy(owner: Owner): Promise<void> {
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
  #cancelDownloads(page: Page): void {
    for (const download of page.downloads) download.cancel();
    page.downloads.clear();
  }
}
