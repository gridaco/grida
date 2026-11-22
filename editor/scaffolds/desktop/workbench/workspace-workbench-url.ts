import type { Workspace } from "@/lib/desktop/bridge";

/**
 * Route helper for opening the desktop workspace workbench.
 *
 * Kept outside `workspace-workbench.tsx` so lightweight pages such as
 * `/desktop/welcome` do not import the workbench component just to build a URL.
 */
export function workspaceWorkbenchHref(workspace: Workspace): string {
  return `/desktop/workspace?id=${encodeURIComponent(workspace.id)}`;
}

/** A same-window navigation can carry the workspace already resolved by Main. */
export namespace WorkspaceOpening {
  let opening: Workspace | undefined;

  export function href(workspace: Workspace): string {
    opening = workspace;
    return workspaceWorkbenchHref(workspace);
  }

  export function peek(id: string | null): Workspace | undefined {
    return opening?.id === id ? opening : undefined;
  }

  export function arrived(workspace: Workspace): void {
    if (opening === workspace) opening = undefined;
  }
}
