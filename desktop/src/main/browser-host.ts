/**
 * GRIDA-SEC-016 — Main owns untrusted pages and their isolated sessions.
 * Guest contents never inherit the application's preload, cookies or authority.
 */
import {
  BrowserWindow,
  WebContentsView,
  dialog,
  session,
  shell,
  type IpcMainInvokeEvent,
  type DownloadItem,
  type NativeImage,
  type Session,
  type WebContents,
  type WebFrameMain,
} from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { DesktopBrowser } from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import { ipc_sender } from "./ipc-sender";

type Page = {
  view: WebContentsView;
  state: { -readonly [K in keyof DesktopBrowser.Page]: DesktopBrowser.Page[K] };
  sequence: number;
  visible: boolean;
  downloads: Set<DownloadItem>;
  navigation: number;
  viewportShown: boolean;
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
  thumbnailBusy: boolean;
};

/** Native browser execution, independent of file, media and agent hosts. */
export class DesktopBrowserHost {
  readonly #owners = new Map<number, Owner>();
  readonly #sessions = new Map<string, Session>();
  readonly #clearing = new Set<string>();
  readonly #pendingAttach = new Map<number, symbol>();

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
    try {
      if (!(await this.options.workspaceExists(workspaceId)))
        throw new Error("browser_workspace_unavailable");
      this.#shell(event);
      if (
        navigated ||
        this.#pendingAttach.get(event.sender.id) !== attempt ||
        event.senderFrame !== frame ||
        event.sender.getURL() !== href ||
        this.#clearing.has(workspaceId)
      )
        throw new Error("browser_attachment_expired");
    } finally {
      event.sender.off("did-start-navigation", navigating);
      event.sender.off("did-navigate", committed);
      event.sender.off("did-fail-provisional-load", failed);
      event.sender.off("did-fail-load", failed);
      if (this.#pendingAttach.get(event.sender.id) === attempt)
        this.#pendingAttach.delete(event.sender.id);
    }
    let owner = this.#owners.get(event.sender.id);
    if (owner && owner.workspaceId !== workspaceId) {
      this.#destroy(owner);
      owner = undefined;
    }
    if (!owner) {
      owner = {
        window,
        shell: event.sender,
        shellId: event.sender.id,
        workspaceId,
        attachmentId: null,
        frame: null,
        revision: 0,
        pages: new Map(),
        disposers: [],
        thumbnailBusy: false,
      };
      this.#owners.set(event.sender.id, owner);
      const owned = owner;
      const closed = () => this.#destroy(owned);
      const navigating = (details: {
        isMainFrame: boolean;
        isSameDocument: boolean;
        url: string;
      }) => {
        if (!details.isMainFrame || details.isSameDocument) return;
        this.#detach(owned);
        if (this.#workspace(details.url) !== owned.workspaceId)
          this.#destroy(owned);
      };
      const committed = (_event: unknown, url: string) => {
        // An attachment may arrive after navigation started in the old document.
        // Full commit must revoke it even when the start event was missed.
        this.#detach(owned);
        if (this.#workspace(url) !== owned.workspaceId) this.#destroy(owned);
      };
      const failed = (
        event: unknown,
        _code: number,
        _description: string,
        url: string,
        isMainFrame: boolean
      ) => {
        // Error documents do not emit did-navigate; failed loads still revoke
        // a late attachment, matching the full navigation-start policy.
        if (isMainFrame) committed(event, url);
      };
      const inPage = (_event: unknown, url: string, isMainFrame: boolean) => {
        if (isMainFrame && this.#workspace(url) !== owned.workspaceId)
          this.#destroy(owned);
      };
      const gone = () => this.#detach(owned);
      const focus = () => this.#refreshFocus(owned);
      window.once("closed", closed);
      event.sender.on("did-start-navigation", navigating);
      event.sender.on("did-navigate", committed);
      event.sender.on("did-fail-provisional-load", failed);
      event.sender.on("did-fail-load", failed);
      event.sender.on("did-navigate-in-page", inPage);
      event.sender.on("render-process-gone", gone);
      event.sender.once("destroyed", closed);
      window.on("focus", focus);
      window.on("blur", focus);
      owner.disposers.push(() => {
        window.off("closed", closed);
        event.sender.off("did-start-navigation", navigating);
        event.sender.off("did-navigate", committed);
        event.sender.off("did-fail-provisional-load", failed);
        event.sender.off("did-fail-load", failed);
        event.sender.off("did-navigate-in-page", inPage);
        event.sender.off("render-process-gone", gone);
        event.sender.off("destroyed", closed);
        window.off("focus", focus);
        window.off("blur", focus);
      });
    }
    // Every attach is a new lease. A late cleanup for an earlier attach may
    // never revoke the newest owner's view, even within the same frame.
    this.#detach(owner);
    owner.frame = event.senderFrame;
    owner.attachmentId = randomUUID();
    for (const page of owner.pages.values()) page.sequence = -1;
    return this.#snapshot(owner);
  }

  snapshot(
    event: IpcMainInvokeEvent,
    attachmentId: unknown
  ): DesktopBrowser.Snapshot {
    return this.#snapshot(this.#attached(event, attachmentId));
  }

  detach(event: IpcMainInvokeEvent, attachmentId: unknown): void {
    this.#detach(this.#attached(event, attachmentId));
  }

  create(event: IpcMainInvokeEvent, raw: unknown): DesktopBrowser.Page {
    const request = this.#record(raw);
    const owner = this.#attached(event, request.attachmentId);
    if (this.#clearing.has(owner.workspaceId))
      throw new Error("browser_session_busy");
    if (owner.pages.size >= 16) throw new Error("browser_page_limit");
    if (
      request.storageScope !== "workspace" &&
      request.storageScope !== "ephemeral"
    )
      throw new Error("browser_storage_invalid");
    const url = request.url === undefined ? null : this.#url(request.url);
    const id = randomUUID();
    const scope = request.storageScope;
    const browserSession = this.#session(
      scope === "workspace" ? owner.workspaceId : id,
      scope === "workspace"
    );
    const view = new WebContentsView({
      webPreferences: {
        session: browserSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInSubFrames: false,
        nodeIntegrationInWorker: false,
        webviewTag: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        disableDialogs: true,
        navigateOnDragDrop: false,
      },
    });
    // Valid on-screen bounds before first navigation prevent macOS first-paint stalls.
    view.setBounds({ x: 0, y: 0, width: 1, height: 1 });
    view.setVisible(false);
    owner.window.contentView.addChildView(view);
    const page: Page = {
      view,
      sequence: -1,
      visible: false,
      downloads: new Set(),
      navigation: 0,
      viewportShown: false,
      state: {
        id,
        revision: 0,
        url: null,
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
    this.#observe(owner, page);
    this.#changed(owner, page);
    if (url) this.#load(owner, page, url);
    return { ...page.state };
  }

  navigate(event: IpcMainInvokeEvent, raw: unknown): void {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    this.#load(owner, page, this.#url(request.url));
  }

  back(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    if (page.view.webContents.navigationHistory.canGoBack()) {
      page.navigation++;
      page.state.loading = true;
      this.#changed(owner, page);
      page.view.webContents.navigationHistory.goBack();
    }
  }
  forward(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    if (page.view.webContents.navigationHistory.canGoForward()) {
      page.navigation++;
      page.state.loading = true;
      this.#changed(owner, page);
      page.view.webContents.navigationHistory.goForward();
    }
  }
  reload(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    page.state.failure = null;
    if (page.state.url) this.#load(owner, page, this.#url(page.state.url));
  }
  stop(event: IpcMainInvokeEvent, raw: unknown): void {
    const [, page] = this.#target(event, raw);
    page.view.webContents.stop();
  }
  focus(event: IpcMainInvokeEvent, raw: unknown): void {
    const [owner, page] = this.#target(event, raw);
    if (page.visible && owner.window.isFocused()) page.view.webContents.focus();
  }
  close(event: IpcMainInvokeEvent, raw: unknown): Promise<void> {
    const [owner, page] = this.#target(event, raw);
    return this.#close(owner, page);
  }

  layout(event: IpcMainInvokeEvent, raw: unknown): void {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    const layout = DesktopBrowser.parseLayout({
      sequence: request.sequence,
      rect: request.rect,
      visible: request.visible,
      ...(request.borderRadius !== undefined
        ? { borderRadius: request.borderRadius }
        : {}),
    });
    if (!layout) throw new Error("browser_layout_invalid");
    const { rect } = layout;
    if (layout.sequence <= page.sequence) return;
    page.sequence = layout.sequence;
    // An inactive DOM slot has no layout box. Keep the page's last real
    // viewport while hidden rather than reflowing its document to 1×1.
    if (!layout.visible && (rect.width === 0 || rect.height === 0)) {
      this.#visible(owner, page, false);
      return;
    }
    const zoom = owner.window.webContents.getZoomFactor();
    const [width, height] = owner.window.getContentSize();
    const x = Math.max(
      0,
      Math.min(width, Math.round((rect.x as number) * zoom))
    );
    const y = Math.max(
      0,
      Math.min(height, Math.round((rect.y as number) * zoom))
    );
    const right = Math.max(
      x,
      Math.min(
        width,
        Math.round(((rect.x as number) + (rect.width as number)) * zoom)
      )
    );
    const bottom = Math.max(
      y,
      Math.min(
        height,
        Math.round(((rect.y as number) + (rect.height as number)) * zoom)
      )
    );
    const visible = layout.visible && right > x && bottom > y;
    if (!visible) this.#visible(owner, page, false);
    page.view.setBounds({
      x,
      y,
      width: Math.max(1, right - x),
      height: Math.max(1, bottom - y),
    });
    // Native pixels sit outside DOM clipping. The presentation owner supplies
    // its resolved CSS radius; Main applies the same zoom as the viewport.
    page.view.setBorderRadius(
      Math.min(
        Math.round((layout.borderRadius ?? 0) * zoom),
        Math.floor(Math.min(right - x, bottom - y) / 2)
      )
    );
    this.#visible(owner, page, visible);
    if (visible) page.viewportShown = true;
  }

  /**
   * Explicit, transient viewport pixels for a tab hover. Never reveals or
   * focuses the page. User behavior: test/desktop-browser-tab-preview.md.
   */
  async thumbnail(
    event: IpcMainInvokeEvent,
    raw: unknown
  ): Promise<DesktopBrowser.Thumbnail | null> {
    const request = this.#record(raw);
    const [owner, page] = this.#target(event, request);
    if (
      owner.thumbnailBusy ||
      !page.viewportShown ||
      !page.state.url ||
      page.state.loading ||
      page.state.failure
    )
      return null;
    const navigation = page.navigation;
    owner.thumbnailBusy = true;
    let captured: NativeImage | null = null;
    try {
      captured = await page.view.webContents.capturePage(undefined, {
        stayHidden: true,
        stayAwake: false,
      });
    } catch {
      /* unavailable compositor frame */
    } finally {
      owner.thumbnailBusy = false;
    }
    // Capture is asynchronous. A replaced attachment or closed page is not
    // permitted to receive its predecessor's pixels, including on failure.
    const [currentOwner, currentPage] = this.#target(event, request);
    if (
      currentOwner !== owner ||
      currentPage !== page ||
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
    for (const owner of this.#owners.values()) this.#destroy(owner);
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
    if (!page || page.view.webContents.isDestroyed())
      throw new Error("browser_page_unavailable");
    return [owner, page];
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
    browserSession.on("will-download", (event, item, contents) => {
      const owner = this.#owners
        .values()
        .find((candidate) =>
          [...candidate.pages.values()].some(
            (page) => page.view.webContents === contents
          )
        );
      if (!owner || !this.#live(owner)) {
        event.preventDefault();
        return;
      }
      // Synchronous selection keeps Electron from starting its implicit save flow.
      const page = Array.from(owner.pages.values()).find(
        (candidate) => candidate.view.webContents === contents
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
    if (!page.visible) page.viewportShown = false;
    page.state.url = url;
    page.state.failure = null;
    page.state.loading = true;
    this.#changed(owner, page);
    void page.view.webContents.loadURL(url).catch(() => {
      // did-fail-load supplies the bounded error; aborted/replaced loads are normal.
    });
  }
  #observe(owner: Owner, page: Page): void {
    const contents = page.view.webContents;
    const navigation = (
      event: { preventDefault(): void; isMainFrame?: boolean },
      url: string
    ) => {
      // Subframes have no application authority. Ordinary blank, srcdoc and
      // generated documents are valid page content; private/file schemes are not.
      if (event.isMainFrame === false) {
        try {
          const parsed = new URL(url);
          if (
            ["http:", "https:", "about:", "blob:", "data:"].includes(
              parsed.protocol
            )
          )
            return;
        } catch {
          /* reject malformed subframe navigation */
        }
        event.preventDefault();
        return;
      }
      try {
        this.#url(url);
      } catch {
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
    contents.on("did-start-navigation", (details) => {
      if (!details.isMainFrame || !owner.pages.has(page.state.id)) return;
      page.navigation++;
      if (!details.isSameDocument) page.viewportShown = page.visible;
    });
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
    // No certificate verifier or trust override: Chromium's verdict stands.
    contents.on("will-prevent-unload", (event) => event.preventDefault());
    const refresh = () => {
      if (contents.isDestroyed() || !owner.pages.has(page.state.id)) return;
      const url = contents.getURL();
      try {
        page.state.url = this.#url(url);
      } catch {
        /* blank/internal error document */
      }
      page.state.loading = contents.isLoading();
      page.state.canGoBack = contents.navigationHistory.canGoBack();
      page.state.canGoForward = contents.navigationHistory.canGoForward();
      page.state.focused =
        page.visible && owner.window.isFocused() && contents.isFocused();
      this.#changed(owner, page);
    };
    contents.on("did-start-loading", refresh);
    contents.on("did-stop-loading", refresh);
    contents.on("did-navigate", refresh);
    contents.on("did-navigate-in-page", refresh);
    contents.on("page-title-updated", (_event, title) => {
      page.state.title =
        this.#text(title, DesktopBrowser.MAX_TITLE_BYTES) || "Untitled";
      refresh();
    });
    contents.on("focus", refresh);
    contents.on("blur", refresh);
    contents.on(
      "did-fail-load",
      (_event, code, _description, _url, isMainFrame) => {
        if (!owner.pages.has(page.state.id) || !isMainFrame || code === -3)
          return;
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
      if (!owner.pages.has(page.state.id) || contents.isDestroyed()) return;
      page.state.loading = false;
      page.state.failure = {
        kind: "renderer-gone",
        code: details.reason.slice(0, 64),
        message: "The page stopped responding. Reload to try again.",
      };
      this.#visible(owner, page, false);
      this.#changed(owner, page);
    });
    contents.on("before-input-event", (event, input) => {
      if (
        !owner.pages.has(page.state.id) ||
        contents.isDestroyed() ||
        !this.#live(owner)
      )
        return;
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
  #refreshFocus(owner: Owner): void {
    if (owner.shell.isDestroyed() || owner.window.isDestroyed()) return;
    for (const page of owner.pages.values()) {
      page.state.focused =
        page.visible &&
        owner.window.isFocused() &&
        !page.view.webContents.isDestroyed() &&
        page.view.webContents.isFocused();
      this.#changed(owner, page);
    }
  }
  #visible(owner: Owner, page: Page, visible: boolean): void {
    if (
      !visible &&
      page.visible &&
      !page.view.webContents.isDestroyed() &&
      page.view.webContents.isFocused() &&
      !owner.shell.isDestroyed()
    )
      owner.shell.focus();
    page.visible = visible;
    if (!owner.shell.isDestroyed() && !owner.window.isDestroyed())
      page.view.setVisible(visible);
    if (!visible && page.state.focused) {
      page.state.focused = false;
      this.#changed(owner, page);
    }
  }
  #changed(owner: Owner, page: Page): void {
    if (!owner.pages.has(page.state.id)) return;
    if (page.state.focused) {
      for (const other of owner.pages.values()) {
        if (other !== page && other.state.focused) {
          other.state.focused = false;
          this.#changed(owner, other);
        }
      }
    }
    page.state.revision = ++owner.revision;
    this.#emit(owner, {
      type: "changed",
      attachmentId: owner.attachmentId!,
      revision: owner.revision,
      page: { ...page.state },
    });
  }
  #emit(owner: Owner, event: DesktopBrowser.Event): void {
    if (this.#live(owner))
      owner.shell.send(IPC_CHANNELS.BROWSER_CHANGED, event);
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
      version: 1,
      attachmentId: owner.attachmentId!,
      revision: owner.revision,
      pages: Array.from(owner.pages.values(), (page) => ({ ...page.state })),
    };
  }
  #detach(owner: Owner): void {
    owner.attachmentId = null;
    owner.frame = null;
    for (const page of owner.pages.values()) {
      this.#cancelDownloads(page);
      this.#visible(owner, page, false);
    }
  }
  async #close(owner: Owner, page: Page): Promise<void> {
    if (!owner.pages.delete(page.state.id)) return;
    this.#cancelDownloads(page);
    this.#visible(owner, page, false);
    if (!owner.shell.isDestroyed() && !owner.window.isDestroyed())
      owner.window.contentView.removeChildView(page.view);
    const contents = page.view.webContents;
    const destroyed = contents.isDestroyed()
      ? Promise.resolve()
      : new Promise<void>((resolve) =>
          contents.once("destroyed", () => resolve())
        );
    if (!contents.isDestroyed()) contents.close({ waitForBeforeUnload: false });
    owner.revision++;
    this.#emit(owner, {
      type: "closed",
      attachmentId: owner.attachmentId!,
      revision: owner.revision,
      pageId: page.state.id,
    });
    if (page.state.storageScope === "ephemeral") {
      const key = `grida-browser-page-${page.state.id}`;
      const browserSession = this.#sessions.get(key);
      this.#sessions.delete(key);
      await destroyed;
      if (browserSession) {
        try {
          await Promise.all([
            browserSession.closeAllConnections(),
            browserSession.clearStorageData(),
            browserSession.clearCache(),
            browserSession.clearAuthCache(),
          ]);
        } catch {
          throw new Error("browser_session_cleanup_failed");
        }
      }
    } else {
      await destroyed;
    }
  }
  #destroy(owner: Owner): void {
    // Shell contents can die before BrowserWindow's closed event. Revoke the
    // publication lease before teardown can emit focus or closed outcomes.
    owner.attachmentId = null;
    owner.frame = null;
    if (this.#owners.get(owner.shellId) === owner)
      this.#owners.delete(owner.shellId);
    for (const dispose of owner.disposers.splice(0)) dispose();
    for (const page of owner.pages.values())
      void this.#close(owner, page).catch(() =>
        console.warn("[grida] browser session cleanup failed")
      );
    this.#detach(owner);
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
