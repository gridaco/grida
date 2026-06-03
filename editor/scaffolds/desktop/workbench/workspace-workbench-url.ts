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
