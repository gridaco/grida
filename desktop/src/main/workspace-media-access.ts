// GRIDA-SEC-004 / GRIDA-SEC-014 — packaged native media scope selection.
import { app } from "electron";
import path from "node:path";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { DesktopMediaRoot } from "./media-root";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { WorkspaceMediaRegistry } from "./workspace-media-registry";

let owner:
  | {
      registry: WorkspaceMediaRegistry;
      workers: WorkspaceFileWorkers;
    }
  | undefined;

export function nativeWorkspaceMedia() {
  if (
    !NativeDesktopProfile.selected() ||
    !app.isPackaged ||
    process.platform !== "darwin" ||
    process.arch !== "arm64"
  ) {
    return undefined;
  }
  if (owner) return owner;
  const agentData = process.env.GRIDA_AGENT_USER_DATA;
  if (!agentData || !path.isAbsolute(agentData)) {
    throw new Error("workspace_media_profile_invalid");
  }
  const { filesystem } = buildDaemonSandboxPolicy({
    user_data: agentData,
    home: app.getPath("home"),
  });
  const workers = new WorkspaceFileWorkers(process.resourcesPath);
  owner = {
    registry: new WorkspaceMediaRegistry([
      ...filesystem.deny_read,
      agentData,
      app.getPath("userData"),
      app.getPath("temp"),
      DesktopMediaRoot.current,
      path.dirname(process.resourcesPath),
    ]),
    workers,
  };
  app.once("will-quit", () => workers.close());
  return owner;
}
