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

const MAX_INVENTORY_BYTES = 64 * 1024;

type Publication = {
  frame: WebFrameMain;
  href: string;
  files: NativeEditorSurfaceSnapshot;
  fileIds: Map<string, string>;
  activePageId: string | null;
};

export type DesktopBrowserToolLease = Readonly<{
  ready(): boolean;
  invoke(
    operation: string,
    args: unknown,
    signal: AbortSignal
  ): Promise<BrowserAutomationResult>;
  close(): void;
}>;

export class DesktopBrowserTools {
  private readonly pages: BrowserAutomation;
  private readonly workbenches = new WeakMap<WebContents, Publication>();

  constructor(private readonly browser: DesktopBrowserHost) {
    this.pages = new BrowserAutomation(browser);
  }

  publish(
    event: IpcMainInvokeEvent,
    args: unknown,
    activePageId: unknown
  ): boolean {
    const files = NativeEditorSurfaces.parse(args);
    const { sender, senderFrame: frame } = event;
    if (
      !files ||
      !frame ||
      sender.isDestroyed() ||
      sender.isLoadingMainFrame() ||
      sender.mainFrame !== frame ||
      (activePageId !== null && !DesktopBrowser.isIdentity(activePageId))
    )
      return false;
    if (!URL.canParse(frame.url)) return false;
    const url = new URL(frame.url);
    if (url.pathname !== "/desktop/workspace" || !url.searchParams.get("id"))
      return false;
    const previous = this.workbenches.get(sender);
    const ids =
      previous?.frame === frame && previous.href === frame.url
        ? previous.fileIds
        : new Map<string, string>();
    const fileIds = new Map(
      files.open.map((path) => [path, ids.get(path) ?? randomUUID()])
    );
    this.workbenches.set(sender, {
      frame,
      href: frame.url,
      files,
      fileIds,
      activePageId,
    });
    return true;
  }

  lease(
    sender: WebContents,
    frame: WebFrameMain,
    requireCurrent: () => void
  ): DesktopBrowserToolLease {
    const id = randomUUID();
    const href = frame.url;
    let closed = false;
    const live = () => {
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
        const publication = this.workbenches.get(sender);
        return publication?.frame === frame && publication.href === href;
      } catch {
        return false;
      }
    };
    const scope: BrowserAutomationScope = { id, sender, frame, live };
    return {
      ready: live,
      invoke: async (operation, args, signal) => {
        if (signal.aborted) return refused("canceled");
        if (!live()) return refused("owner_revoked");
        if (operation === "surface_list_open" || operation === "surface_open") {
          try {
            return operation === "surface_list_open"
              ? this.list(scope, args)
              : this.open(scope, args, signal);
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
    const publication = this.workbenches.get(scope.sender)!;
    const pages = this.browser
      .automationWorkbenchPages(scope)
      .map((page) => page.snapshot());
    const tabs = [
      ...publication.files.open.map((path) => ({
        tabId: publication.fileIds.get(path)!,
        kind: "file",
        path,
      })),
      ...pages.map((page) => ({
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
    ];
    const activeTabId = publication.files.active
      ? (publication.fileIds.get(publication.files.active) ?? null)
      : pages.some((page) => page.id === publication.activePageId)
        ? publication.activePageId
        : null;
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

  private open(
    scope: BrowserAutomationScope,
    args: unknown,
    signal: AbortSignal
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
    const publication = this.workbenches.get(scope.sender)!;
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
      if (!file) {
        if (!this.browser.presentWorkbenchAutomationPage(scope, tabId, focus))
          return refused("target_missing");
        return requested({ tabId });
      }
      path = file[0];
    } else return refused("invalid_arguments");
    if (signal.aborted || !scope.live()) return refused("owner_revoked");
    scope.frame.send(IPC_CHANNELS.WORKSPACE_OPEN_AUTOMATION_FILE, {
      path,
      expiresAtMs: Date.now() + 2000,
    });
    if (focus) {
      try {
        const window = BrowserWindow.fromWebContents(scope.sender);
        window?.show();
        window?.focus();
      } catch {
        // File dispatch was accepted by the captured frame already.
      }
    }
    return requested(tabId ? { tabId } : {});
  }
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
