import { DesktopBrowser } from "@grida/desktop-bridge";
import { WorkspaceArtifact } from "./workspace-artifact";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const STORAGE_KEY_PREFIX = "grida.workspaceViewState:";
const VERSION = 2;

/**
 * Optional, workspace-scoped renderer state.
 *
 * The daemon remains authoritative for workspace registration and filesystem
 * contents. This local record only remembers how the user was looking at one
 * workspace; every artifact path is revalidated through the Desktop bridge
 * before the workbench restores it.
 *
 * `tabs` is deliberately nested rather than making this a flat tab record.
 * Future workbench state (for example panel visibility) can earn a sibling
 * field without coupling those semantics to the editor-group model.
 */
export namespace WorkspaceViewState {
  export type Tabs = Readonly<{
    open: readonly string[];
    active: string | null;
  }>;

  export type ContentTab =
    | Readonly<{ kind: "file"; relPath: string }>
    | Readonly<{
        kind: "browser";
        id: string;
        pageId: string;
        url: string | null;
      }>;

  export type Content = Readonly<{
    open: readonly ContentTab[];
    active: number | null;
  }>;

  export type State = Readonly<{
    tabs: Tabs;
    /** Mixed presentation order. Page IDs only reconnect live native pages. */
    content?: Content;
  }>;

  export function remember(
    storage: StorageLike,
    workspaceId: string,
    state: State
  ): void {
    const normalized = normalize(state);
    try {
      storage.setItem(
        storageKey(workspaceId),
        JSON.stringify({ version: VERSION, ...normalized })
      );
    } catch {
      // Optional UX state: storage denial/quota must never block the editor.
    }
  }

  export function read(
    storage: StorageLike,
    workspaceId: string
  ): State | null {
    const key = storageKey(workspaceId);
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return null;
    }
    if (!raw) return null;

    try {
      const value = JSON.parse(raw) as Record<string, unknown>;
      if (
        (value.version !== VERSION && value.version !== 1) ||
        !isRecord(value.tabs)
      ) {
        forget(storage, workspaceId);
        return null;
      }
      const tabs = value.tabs;
      if (!Array.isArray(tabs.open)) {
        forget(storage, workspaceId);
        return null;
      }
      const state = normalize({
        ...(value.version === VERSION && isRecord(value.content)
          ? { content: value.content as unknown as Content }
          : {}),
        tabs: {
          open: tabs.open.filter(
            (path): path is string => typeof path === "string"
          ),
          active: typeof tabs.active === "string" ? tabs.active : null,
        },
      });
      return state;
    } catch {
      forget(storage, workspaceId);
      return null;
    }
  }

  /**
   * Choose the initial tab group for a workbench mount.
   *
   * `legacyActivePath` migrates the former one-path last-workspace record only
   * when no workspace-scoped state has been written yet.
   */
  export function initialTabs(
    storage: StorageLike,
    workspaceId: string,
    legacyActivePath?: string
  ): Tabs {
    const persisted = read(storage, workspaceId);
    if (persisted) return persisted.tabs;

    const legacy =
      legacyActivePath === undefined
        ? null
        : WorkspaceArtifact.normalizeRelativePath(legacyActivePath);
    return legacy === null
      ? { open: [], active: null }
      : { open: [legacy], active: legacy };
  }

  export function forget(storage: StorageLike, workspaceId: string): void {
    try {
      storage.removeItem(storageKey(workspaceId));
    } catch {
      // Optional UX state: best-effort cleanup only.
    }
  }

  function normalize(state: State): State {
    const open: string[] = [];
    const seen = new Set<string>();
    for (const path of state.tabs.open) {
      const normalized = WorkspaceArtifact.normalizeRelativePath(path);
      if (normalized === null || seen.has(normalized)) continue;
      seen.add(normalized);
      open.push(normalized);
    }

    const requestedActive =
      state.tabs.active === null
        ? null
        : WorkspaceArtifact.normalizeRelativePath(state.tabs.active);
    const active =
      requestedActive !== null && seen.has(requestedActive)
        ? requestedActive
        : (open.at(-1) ?? null);
    const result: State = { tabs: { open, active } };
    if (!state.content || !Array.isArray(state.content.open)) return result;
    const content: ContentTab[] = [];
    const identities = new Set<string>();
    let contentActive: number | null = null;
    state.content.open.slice(0, 200).forEach((entry, index) => {
      if (!isRecord(entry)) return;
      let tab: ContentTab;
      let identity: string;
      if (entry.kind === "file" && typeof entry.relPath === "string") {
        const relPath = WorkspaceArtifact.normalizeRelativePath(entry.relPath);
        if (relPath === null) return;
        tab = { kind: "file", relPath };
        identity = `file:${relPath}`;
      } else if (
        entry.kind === "browser" &&
        DesktopBrowser.isIdentity(entry.id) &&
        DesktopBrowser.isIdentity(entry.pageId)
      ) {
        const url = browserUrl(entry.url);
        if (url === undefined) return;
        tab = { kind: "browser", id: entry.id, pageId: entry.pageId, url };
        identity = `browser:${entry.id}`;
      } else return;
      if (identities.has(identity)) return;
      identities.add(identity);
      if (index === state.content?.active) contentActive = content.length;
      content.push(tab);
    });
    return {
      ...result,
      content: {
        open: content,
        active: contentActive ?? (content.length ? content.length - 1 : null),
      },
    };
  }
}

function storageKey(workspaceId: string): string {
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(workspaceId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function browserUrl(value: unknown): string | null | undefined {
  if (value === null) return null;
  return DesktopBrowser.normalizeUrl(value) ?? undefined;
}
