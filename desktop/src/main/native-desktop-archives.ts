// GRIDA-SEC-004 / GRIDA-SEC-014 — archive composition follows the active workspace registry.
import type { NativeDesktopAgent } from "./native-desktop-agent";
import { NativeArchives } from "./native-archives";
import { servicesSidecarClient } from "./services-sidecar-client";

/** Both ordinary and isolated launches use the existing registry adapter. */
export function createDesktopArchives(
  native: NativeDesktopAgent | null | undefined,
  resourcesPath: string
): NativeArchives | undefined {
  if (!native) return undefined;
  return new NativeArchives({
    resourcesPath,
    workspaces: () => servicesSidecarClient.listWorkspaces(),
    resolve: (id) => native.archiveWorkspace(id),
    directory: (id, root) => native.archiveDirectory(id, root),
    active: (id) => native.archiveOwner(id),
  });
}
