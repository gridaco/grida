// GRIDA-SEC-004 / GRIDA-SEC-016 — tools address the captured Desktop workbench.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { workspaceFs } from "@grida/daemon/server";
import {
  DesktopBrowser,
  NativeEditorSurfaces,
  type NativeEditorSurfaceSnapshot,
} from "@grida/desktop-bridge";
import { DesktopBrowserMcp } from "./desktop-browser-mcp";
import type {
  BrowserWorkbenchTab,
  DesktopBrowserToolLease,
} from "./desktop-browser-tools";
import catalog from "./desktop-workbench-tools.json";
import { NativeDesktopTools } from "./native-desktop-tools";
import { resolveContainedEntry, WorkspaceFileError } from "./workspace-files";

const TRANSFER_BYTES = 32 * 1024;
const MAX_INVENTORY_BYTES = TRANSFER_BYTES - 1024;

type FileTab = Readonly<{ kind: "file"; tabId: string; path: string }>;
type WorkbenchTab = FileTab | BrowserWorkbenchTab;

type FilePresentation = Readonly<{
  requested: boolean;
  focused?: boolean;
}>;
type Presentation = (
  path: string,
  call: NativeDesktopTools.Invocation,
  revision: number,
  focus: (() => boolean) | undefined
) => FilePresentation;

export class DesktopWorkbenchTools {
  static readonly listName = catalog.list.name;
  static readonly showName = catalog.show.name;

  private files = new Map<string, FileTab>();
  private activeFile: FileTab | undefined;
  private truncated = false;

  constructor(
    private readonly root: string,
    snapshot: NativeEditorSurfaceSnapshot
  ) {
    this.update(snapshot);
  }

  update(snapshot: NativeEditorSurfaceSnapshot): void {
    this.files = new Map(
      snapshot.open.map((virtual) => [
        virtual,
        this.files.get(virtual) ?? {
          kind: "file",
          tabId: randomUUID(),
          path: virtual.slice(1),
        },
      ])
    );
    this.activeFile = snapshot.active
      ? this.files.get(snapshot.active)
      : undefined;
    this.truncated = snapshot.truncated;
  }

  bind(
    browser: DesktopBrowserToolLease | undefined,
    browserGranted: boolean,
    revision: (() => number | undefined) | undefined,
    present: Presentation
  ): NativeDesktopTools.Tool[] {
    const browserLease = browserGranted ? browser : undefined;
    const transfer = {
      maxInputBytes: TRANSFER_BYTES,
      maxOutputBytes: TRANSFER_BYTES,
    };
    const tools: NativeDesktopTools.Tool[] = [
      {
        definition: {
          name: catalog.list.name,
          description: catalog.list.description,
          inputSchema: catalog.list.inputSchema,
          outputSchema: catalog.list.outputSchema,
          annotations: { readOnlyHint: true },
        },
        revision: catalog.list.version,
        transfer,
        invoke: (args) =>
          args && Object.keys(args).length
            ? NativeDesktopTools.failure("invalid_editor_surface_arguments")
            : this.list(browserLease?.workbench),
      },
    ];
    if (!revision) return tools;

    const schema = catalog.show.inputSchema;
    const inputSchema = browserGranted
      ? schema
      : {
          ...schema,
          properties: {
            target: {
              oneOf: schema.properties.target.oneOf.filter(
                ({ properties }) => properties.kind.const !== "url"
              ),
            },
            presentation: { const: "reveal" },
          },
        };
    tools.push({
      definition: {
        name: catalog.show.name,
        description: catalog.show.description,
        inputSchema,
        outputSchema: catalog.show.outputSchema,
      },
      revision: catalog.show.version,
      resultDisposition: true,
      transfer,
      invoke: (args, call) =>
        this.show(args, call, browserLease, revision(), present),
    });
    return tools;
  }

  private list(browser: DesktopBrowserToolLease["workbench"]) {
    const browserTabs = browser?.tabs();
    const activeTabId =
      this.activeFile?.tabId ?? browserTabs?.activeTabId ?? null;
    const tabs = budgetInventory(
      [...this.files.values(), ...(browserTabs?.tabs ?? [])],
      activeTabId
    );
    return {
      content: [],
      isError: false,
      structuredContent: {
        activeTabId: tabs.items.some(({ tabId }) => tabId === activeTabId)
          ? activeTabId
          : null,
        tabs: tabs.items,
        truncated: this.truncated || tabs.truncated,
      },
    };
  }

  private async show(
    args: Readonly<Record<string, unknown>> | undefined,
    call: NativeDesktopTools.Invocation,
    browserLease: DesktopBrowserToolLease | undefined,
    revision: number | undefined,
    present: Presentation
  ): Promise<NativeDesktopTools.ToolResult> {
    const target = record(args?.target);
    const presentation =
      args && Object.hasOwn(args, "presentation")
        ? args.presentation
        : "reveal";
    if (
      !args ||
      !target ||
      Object.keys(args).some(
        (key) => key !== "target" && key !== "presentation"
      ) ||
      Object.keys(target).length !== 2 ||
      (presentation !== "reveal" && presentation !== "focus")
    )
      return refused("invalid_arguments");
    if (call.signal.aborted || call.expiresAtMs <= Date.now())
      return refused("canceled");

    const focus = presentation === "focus";
    const browser = browserLease?.workbench;
    if (focus && (!browser || !browserLease?.ready()))
      return refused("owner_revoked");
    if (target.kind === "url" && typeof target.url === "string")
      return browser
        ? DesktopBrowserMcp.project(
            browser.show({ kind: "url", url: target.url }, focus)
          )
        : refused("owner_revoked");

    const tabId =
      target.kind === "tab" && DesktopBrowser.isIdentity(target.tabId)
        ? target.tabId
        : undefined;
    const file = tabId
      ? [...this.files.values()].find((entry) => entry.tabId === tabId)
      : undefined;
    if (tabId && !file)
      return browser
        ? DesktopBrowserMcp.project(browser.show({ kind: "tab", tabId }, focus))
        : refused("target_missing");

    if (!file && target.kind !== "file") return refused("invalid_arguments");
    const virtual = workspacePath(this.root, file ? file.path : target.path);
    if (!virtual) return refused("invalid_surface_path");
    const relative = virtual.slice(1);
    try {
      const resolved = await resolveContainedEntry(this.root, relative);
      if (!workspacePath(this.root, resolved))
        return refused("invalid_surface_path");
      const entry = await fs.lstat(path.join(this.root, relative));
      const kind = entry.isFile()
        ? "file"
        : entry.isDirectory()
          ? "directory"
          : "other";
      const parent = path.posix.dirname(relative);
      const [available] = workspaceFs.projectDirectory(
        parent === "." ? "" : parent,
        [{ name: path.posix.basename(relative), kind }]
      );
      if (
        !available ||
        (available.kind !== "file" &&
          !(
            available.kind === "directory" &&
            relative.toLowerCase().endsWith(".canvas")
          ))
      )
        return refused("target_missing");
    } catch (error) {
      return refused(
        error instanceof WorkspaceFileError
          ? "invalid_surface_path"
          : "target_missing"
      );
    }
    if (call.signal.aborted || call.expiresAtMs <= Date.now())
      return refused("canceled");
    if (focus && !browserLease?.ready()) return refused("owner_revoked");
    if (revision === undefined)
      return refused("editor_surface_endpoint_unavailable");
    const result = present(
      virtual,
      call,
      revision,
      focus ? browser?.focus : undefined
    );
    if (!result.requested)
      return refused("editor_surface_endpoint_unavailable");
    if (focus && result.focused !== true)
      return DesktopBrowserMcp.project({
        disposition: "unknown",
        error: "outcome_unknown",
      });
    return DesktopBrowserMcp.project({
      disposition: "dispatched_verified",
      data: {
        requested: true,
        path: relative,
        ...(file && { tabId: file.tabId }),
      },
    });
  }
}

function workspacePath(root: string, value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value) > 4096 ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.split("/").includes("..")
  )
    return;
  const absolute = path.resolve(root, value);
  const relative = path.relative(root, absolute);
  if (path.isAbsolute(relative)) return;
  const virtual = `/${relative.split(path.sep).join("/")}`;
  return NativeEditorSurfaces.isPath(virtual) ? virtual : undefined;
}

function budgetInventory(tabs: WorkbenchTab[], activeTabId: string | null) {
  const active = tabs.find(({ tabId }) => tabId === activeTabId);
  const ordered = active
    ? [active, ...tabs.filter((tab) => tab !== active)]
    : tabs;
  const items: WorkbenchTab[] = [];
  let size = 0;
  for (const tab of ordered) {
    const bytes = Buffer.byteLength(JSON.stringify(tab)) + 1;
    if (size + bytes > MAX_INVENTORY_BYTES) continue;
    items.push(tab);
    size += bytes;
  }
  return { items, truncated: items.length < tabs.length };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function refused(error: string): NativeDesktopTools.ToolResult {
  return DesktopBrowserMcp.project({ disposition: "not_dispatched", error });
}
