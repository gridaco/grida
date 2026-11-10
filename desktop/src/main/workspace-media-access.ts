// GRIDA-SEC-004 / GRIDA-SEC-014 — packaged native media scope selection.
import { app } from "electron";
import path from "node:path";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { DesktopMediaRoot } from "./media-root";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

let workers: WorkspaceFileWorkers | undefined;

export function nativeWorkspaceMedia() {
  if (
    !NativeDesktopProfile.selected() ||
    !app.isPackaged ||
    process.platform !== "darwin" ||
    process.arch !== "arm64"
  ) {
    return undefined;
  }
  if (workers) return workers;
  const owner = new WorkspaceFileWorkers(process.resourcesPath);
  workers = owner;
  app.once("will-quit", () => owner.close());
  return owner;
}

/** Initialized by Main after acquiring the native profile's instance lock. */
export function nativeWorkspaceCatalog() {
  const agentData = process.env.GRIDA_AGENT_USER_DATA;
  if (!agentData || !path.isAbsolute(agentData))
    throw new Error("workspace_catalog_profile_invalid");
  const { filesystem } = buildDaemonSandboxPolicy({
    user_data: agentData,
    home: app.getPath("home"),
  });
  return new NativeWorkspaceCatalog({
    browserData: app.getPath("userData"),
    projectsRoot: path.join(app.getPath("documents"), "Grida Projects"),
    protectedPaths: [
      ...filesystem.deny_read,
      agentData,
      app.getPath("temp"),
      DesktopMediaRoot.current,
      ...(app.isPackaged ? [path.dirname(process.resourcesPath)] : []),
    ],
  });
}
