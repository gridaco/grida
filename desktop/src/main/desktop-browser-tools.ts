// GRIDA-SEC-004 / GRIDA-SEC-016 — exact workbench and private browser tool scopes.
import { randomUUID } from "node:crypto";
import {
  BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContents,
  type WebFrameMain,
} from "electron";
import {
  DesktopBrowser,
  NativeEditorSurfaces,
  type DesktopFxViewer,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { IPC_CHANNELS } from "../bridge/contract";
import {
  BrowserAutomation,
  type BrowserAutomationResult,
} from "./browser-automation";
import type {
  BrowserAutomationScope,
  DesktopBrowserHost,
} from "./browser-host";
import type { FxViewer, FxViewerFileOutcome } from "./fx-viewer";
import { ipc_sender } from "./ipc-sender";

const MAX_INVENTORY_BYTES = 64 * 1024;

type Publication = {
  viewId?: number;
  files: NativeEditorSurfaceSnapshot;
  fileIds: Map<string, string>;
  activePageId: string | null;
  activeRevision: number;
};

type WorkbenchDocument = {
  frame: WebFrameMain;
  href: string;
  retiredThrough: number;
  publication?: Publication;
  unwatch(): void;
};

export type BrowserWorkbenchTarget =
  | Readonly<{ kind: "url"; url: string }>
  | Readonly<{ kind: "tab"; tabId: string }>;

export type BrowserWorkbenchTab = Readonly<{
  tabId: string;
  kind: "browser";
  title: string | null;
  url: string | null;
  state: "failed" | "ready" | "pending";
}>;

export type DesktopBrowserToolLease = Readonly<{
  ready(): boolean;
  invoke(
    operation: string,
    args: unknown,
    signal: AbortSignal,
    expiresAtMs?: number
  ): Promise<BrowserAutomationResult>;
  workbench?: Readonly<{
    tabs(): Readonly<{
      activeTabId: string | null;
      tabs: BrowserWorkbenchTab[];
    }> | null;
    show(
      target: BrowserWorkbenchTarget,
      focus: boolean
    ): BrowserAutomationResult;
    focus(): boolean;
  }>;
  close(): void;
}>;

export class DesktopBrowserTools {
  private readonly pages: BrowserAutomation;
  private readonly workbenches = new WeakMap<WebContents, WorkbenchDocument>();

  constructor(
    private readonly browser: DesktopBrowserHost,
    private readonly fxViewer?: FxViewer
  ) {
    this.pages = new BrowserAutomation(browser);
  }

  publish(
    event: IpcMainInvokeEvent,
    args: unknown,
    activePageId: unknown,
    viewId?: unknown
  ): boolean {
    const files = NativeEditorSurfaces.parse(args);
    if (
      !files ||
      (activePageId !== null && !DesktopBrowser.isIdentity(activePageId)) ||
      (viewId !== undefined && !validViewId(viewId))
    )
      return false;
    const document = this.workbenchDocument(event);
    if (
      !document ||
      (viewId ?? 0) < (document.publication?.viewId ?? 0) ||
      (document.retiredThrough > 0 && (viewId ?? 0) <= document.retiredThrough)
    )
      return false;
    const previous = document.publication;
    const ids = previous?.viewId === viewId ? previous?.fileIds : undefined;
    const fileIds = new Map(
      files.open.map((path) => [path, ids?.get(path) ?? randomUUID()])
    );
    document.publication = {
      viewId,
      files,
      fileIds,
      activePageId,
      activeRevision:
        (previous?.activeRevision ?? 0) +
        (previous &&
        previous.viewId === viewId &&
        previous.activePageId === activePageId
          ? 0
          : 1),
    };
    return true;
  }

  retire(event: IpcMainInvokeEvent, viewId: unknown): boolean {
    if (!validViewId(viewId)) return false;
    const document = this.workbenchDocument(event);
    if (!document) return false;
    document.retiredThrough = Math.max(viewId, document.retiredThrough);
    if ((document.publication?.viewId ?? 0) <= viewId)
      document.publication = undefined;
    return true;
  }

  private workbenchDocument({
    sender,
    senderFrame: frame,
  }: IpcMainInvokeEvent): WorkbenchDocument | undefined {
    if (
      !frame ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.mainFrame !== frame ||
      !URL.canParse(frame.url)
    )
      return;
    const href = frame.url;
    const url = new URL(href);
    if (url.pathname !== "/desktop/workspace" || !url.searchParams.get("id"))
      return;
    const existing = this.workbenches.get(sender);
    if (existing?.frame === frame && existing.href === href) return existing;
    existing?.unwatch();
    const document: WorkbenchDocument = {
      frame,
      href,
      retiredThrough: 0,
      unwatch: ipc_sender.watchNavigation(sender, () => {
        document.unwatch();
        if (this.workbenches.get(sender) === document)
          this.workbenches.delete(sender);
      }),
    };
    this.workbenches.set(sender, document);
    return document;
  }

  async captureEditorObservation(sender: WebContents, signal?: AbortSignal) {
    if (!this.fxViewer) return null;
    const selected = this.selectedFxPage(sender);
    return selected
      ? this.fxViewer.captureSelected(
          selected,
          signal ?? AbortSignal.timeout(6000)
        )
      : null;
  }

  async activateFxViewerFile(
    sender: WebContents,
    pageId: string,
    reference: unknown,
    opening: Parameters<FxViewer["activateFile"]>[2],
    signal: AbortSignal
  ): Promise<FxViewerFileOutcome> {
    if (!this.fxViewer) return "unavailable";
    const selected = this.selectedFxPage(sender);
    return selected?.tabId === pageId
      ? this.fxViewer.activateFile(selected, reference, opening, signal)
      : "stale";
  }

  async resolveFxPreview(
    sender: WebContents,
    entry: unknown
  ): Promise<DesktopFxViewer.Preview> {
    const unavailable = { state: "unavailable" } as const;
    if (!this.fxViewer || sender.isDestroyed()) return unavailable;
    const scope = this.workbenchScope(sender, sender.mainFrame);
    try {
      const lease = this.browser.automationWorkspace(scope);
      const result = await this.fxViewer.resolvePreview(
        { workspaceId: lease.workspaceId, entry },
        AbortSignal.timeout(5000)
      );
      return lease.current() ? result : unavailable;
    } catch {
      return unavailable;
    }
  }

  private workbenchScope(
    sender: WebContents,
    frame: WebFrameMain,
    href = frame.url
  ): BrowserAutomationScope {
    return {
      id: randomUUID(),
      sender,
      frame,
      live: () =>
        !sender.isDestroyed() &&
        !sender.isLoadingMainFrame() &&
        sender.mainFrame === frame &&
        frame.url === href,
    };
  }

  private selectedFxPage(sender: WebContents) {
    const document = this.workbenches.get(sender);
    const publication = document?.publication;
    if (!document || !publication?.activePageId || sender.isDestroyed())
      return null;
    const { frame, href } = document;
    const { activePageId: tabId, activeRevision, viewId } = publication;
    const workspaceId = new URL(href).searchParams.get("id");
    if (!workspaceId || !/^[a-f0-9]{16}$/.test(workspaceId)) return null;
    const auth = this.workbenchScope(sender, frame, href);
    try {
      const page = this.browser.resolveAutomationPage(auth, {
        kind: "workbench",
        tabId,
      });
      const { url } = page.snapshot();
      if (!url) return null;
      return {
        url,
        workspaceId,
        tabId,
        selected: () => {
          const current = this.workbenches.get(sender);
          const latest = current?.publication;
          return (
            current === document &&
            latest?.activeRevision === activeRevision &&
            latest?.activePageId === tabId &&
            latest?.viewId === viewId &&
            page.visible()
          );
        },
        observe: (url: string, script: string, signal: AbortSignal) =>
          this.pages.observeWorkbenchDocument(page, url, script, signal),
      };
    } catch {
      return null;
    }
  }

  lease(
    sender: WebContents,
    frame: WebFrameMain,
    requireCurrent: () => void
  ): DesktopBrowserToolLease {
    const id = randomUUID();
    const href = frame.url;
    const document = this.workbenches.get(sender);
    const viewId = document?.publication?.viewId;
    let closed = false;
    const routeCurrent = () => {
      if (
        closed ||
        sender.isDestroyed() ||
        sender.isLoadingMainFrame() ||
        sender.mainFrame !== frame ||
        frame.url !== href
      )
        return false;
      try {
        requireCurrent();
        return true;
      } catch {
        return false;
      }
    };
    let browser:
      | ReturnType<DesktopBrowserHost["automationWorkspace"]>
      | undefined;
    try {
      browser = this.browser.automationWorkspace({
        id,
        sender,
        frame,
        live: routeCurrent,
      });
    } catch {
      // A chat can still publish file surfaces without browser authority.
    }
    const live = () => {
      if (!browser?.current()) return false;
      const current = this.workbenches.get(sender);
      return (
        current?.frame === frame &&
        current.href === href &&
        (document === undefined || current === document) &&
        current.publication !== undefined &&
        current.publication.viewId === viewId
      );
    };
    const scope: BrowserAutomationScope = { id, sender, frame, live };
    return {
      ready: live,
      workbench: {
        tabs: () => (live() ? this.browserTabs(scope) : null),
        show: (target, focus) => {
          if (!live()) return refused("owner_revoked");
          try {
            return this.showBrowserTarget(scope, target, focus);
          } catch {
            return { disposition: "unknown", error: "outcome_unknown" };
          }
        },
        focus: () => this.focusWorkbench(scope),
      },
      invoke: async (operation, args, signal, expiresAtMs) => {
        if (
          signal.aborted ||
          (expiresAtMs !== undefined && expiresAtMs <= Date.now())
        )
          return refused("canceled");
        if (!live()) return refused("owner_revoked");
        if (operation === "surface_list_open" || operation === "surface_open") {
          try {
            return operation === "surface_list_open"
              ? this.list(scope, args)
              : this.open(scope, args, signal, expiresAtMs);
          } catch {
            return operation === "surface_list_open"
              ? refused("target_missing")
              : { disposition: "unknown", error: "outcome_unknown" };
          }
        }
        return this.pages.invoke(scope, operation, args, signal);
      },
      close: () => {
        if (closed) return;
        closed = true;
        this.pages.closeScope(id);
      },
    };
  }

  private list(
    scope: BrowserAutomationScope,
    args: unknown
  ): BrowserAutomationResult {
    const request = record(args);
    if (!request || Object.keys(request).length !== 0)
      return refused("invalid_arguments");
    const publication = this.workbenches.get(scope.sender)!.publication!;
    const pages = this.browserTabs(scope);
    const tabs = [
      ...publication.files.open.map((path) => ({
        tabId: publication.fileIds.get(path)!,
        kind: "file",
        path,
      })),
      ...pages.tabs,
    ];
    const activeTabId = publication.files.active
      ? (publication.fileIds.get(publication.files.active) ?? null)
      : pages.activeTabId;
    const active = tabs.find((tab) => tab.tabId === activeTabId);
    let truncated = publication.files.truncated;
    let bytes = 0;
    const open = [];
    // Reserve the active tab, then preserve the rest of the published order.
    for (const tab of active
      ? [active, ...tabs.filter((tab) => tab !== active)]
      : tabs) {
      const length = Buffer.byteLength(JSON.stringify(tab)) + 1;
      if (bytes + length > MAX_INVENTORY_BYTES) {
        truncated = true;
        continue;
      }
      bytes += length;
      open.push(tab);
    }
    return {
      disposition: "not_dispatched",
      data: { activeTabId, tabs: open, truncated },
    };
  }

  private browserTabs(scope: BrowserAutomationScope) {
    const pages = this.browser
      .automationWorkbenchPages(scope)
      .map((page) => page.snapshot());
    const { activePageId } = this.workbenches.get(scope.sender)!.publication!;
    return {
      activeTabId: pages.some((page) => page.id === activePageId)
        ? activePageId
        : null,
      tabs: pages.map<BrowserWorkbenchTab>((page) => ({
        tabId: page.id,
        kind: "browser",
        title: page.title,
        url: page.url,
        state: page.failure
          ? "failed"
          : page.mounted && !page.loading && page.url
            ? "ready"
            : "pending",
      })),
    };
  }

  private showBrowserTarget(
    scope: BrowserAutomationScope,
    target: BrowserWorkbenchTarget,
    focus: boolean
  ): BrowserAutomationResult {
    if (target.kind === "url") {
      const url = DesktopBrowser.normalizeUrl(target.url);
      if (!url) return refused("invalid_arguments");
      const page = this.browser.openWorkbenchAutomationPage(scope, url);
      const readiness = this.pages.registerOpen(scope, page);
      const tabId = page.snapshot().id;
      if (focus)
        this.browser.presentWorkbenchAutomationPage(scope, tabId, true);
      return requested({ tabId, readiness });
    }
    if (
      !this.browser.presentWorkbenchAutomationPage(scope, target.tabId, focus)
    )
      return refused("target_missing");
    return requested({ tabId: target.tabId });
  }

  private focusWorkbench(scope: BrowserAutomationScope): boolean {
    if (!scope.live()) return false;
    try {
      const window = BrowserWindow.fromWebContents(scope.sender);
      if (!window) return false;
      window.show();
      window.focus();
      return true;
    } catch {
      return false;
    }
  }

  private open(
    scope: BrowserAutomationScope,
    args: unknown,
    signal: AbortSignal,
    expiresAtMs = Infinity
  ): BrowserAutomationResult {
    const request = record(args);
    const target = record(request?.target);
    const presentation =
      request && Object.hasOwn(request, "presentation")
        ? request.presentation
        : "reveal";
    if (
      !request ||
      Object.keys(request).some(
        (key) => key !== "target" && key !== "presentation"
      ) ||
      !target ||
      Object.keys(target).length !== 2 ||
      (presentation !== "reveal" && presentation !== "focus")
    )
      return refused("invalid_arguments");
    const focus = presentation === "focus";
    if (target.kind === "url" && typeof target.url === "string")
      return this.showBrowserTarget(
        scope,
        { kind: "url", url: target.url },
        focus
      );
    const publication = this.workbenches.get(scope.sender)!.publication!;
    let path: string;
    let tabId: string | undefined;
    if (target.kind === "file" && NativeEditorSurfaces.isPath(target.path)) {
      path = target.path;
      tabId = publication.fileIds.get(path);
    } else if (
      target.kind === "tab" &&
      DesktopBrowser.isIdentity(target.tabId)
    ) {
      tabId = target.tabId;
      const file = [...publication.fileIds].find(([, id]) => id === tabId);
      if (!file)
        return this.showBrowserTarget(scope, { kind: "tab", tabId }, focus);
      path = file[0];
    } else return refused("invalid_arguments");
    if (signal.aborted || expiresAtMs <= Date.now()) return refused("canceled");
    if (!scope.live()) return refused("owner_revoked");
    scope.frame.send(IPC_CHANNELS.WORKSPACE_OPEN_AUTOMATION_FILE, {
      path,
      expiresAtMs: Math.min(expiresAtMs, Date.now() + 2000),
      ...(publication.viewId === undefined
        ? {}
        : { viewId: publication.viewId }),
    });
    if (focus) this.focusWorkbench(scope);
    return requested(tabId ? { tabId } : {});
  }
}

function validViewId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function refused(error: string): BrowserAutomationResult {
  return { disposition: "not_dispatched", error };
}

function requested(data: Record<string, unknown>): BrowserAutomationResult {
  return {
    disposition: "dispatched_verified",
    data: { admission: "accepted", presentation: "requested", ...data },
  };
}
