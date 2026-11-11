// GRIDA-SEC-004 / GRIDA-SEC-014 — packaged native media scope selection.
import { app } from "electron";
import path from "node:path";
import { defaultScratchBase } from "@grida/agent/sandbox";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import { home } from "@grida/home";
import { DesktopMediaRoot } from "./media-root";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { NativeDocumentFiles } from "./native-document-files";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

let workers: WorkspaceFileWorkers | undefined;

export function nativeWorkspaceMedia() {
  if (!NativeDesktopProfile.selected() || !nativeFilePlatform()) return;
  return fileWorkers();
}

/** Ordinary Desktop uses a selected-file owner independently of its workspace registry. */
export function ordinarySelectedSvgFiles(
  identityDirectory?: string,
  protectedPaths: readonly string[] = []
) {
  if (
    !nativeFilePlatform() ||
    (!identityDirectory && !process.argv.includes("--disable-agent")) ||
    NativeDesktopProfile.firstSelected()
  )
    return;
  const userHome = app.getPath("home");
  const gridaHome = home.dir();
  const agentData = path.resolve(
    NativeDesktopProfile.agentData() ?? path.join(gridaHome, "agent")
  );
  const { filesystem } = buildDaemonSandboxPolicy({
    user_data: agentData,
    home: userHome,
  });
  const temp = app.getPath("temp");
  return new NativeDocumentFiles(
    [
      ...protectedPaths,
      ...filesystem.deny_read,
      gridaHome,
      agentData,
      app.getPath("userData"),
      app.getPath("sessionData"),
      ...[
        agentData,
        path.join(gridaHome, "agent"),
        path.join(userHome, ".grida", "agent"),
      ].map((directory) => defaultScratchBase(directory, temp)),
      DesktopMediaRoot.current(),
      path.dirname(process.resourcesPath),
    ],
    userHome,
    fileWorkers(),
    identityDirectory
  );
}

function nativeFilePlatform(): boolean {
  return (
    app.isPackaged && process.platform === "darwin" && process.arch === "arm64"
  );
}

function fileWorkers(): WorkspaceFileWorkers {
  if (workers) return workers;
  const owner = new WorkspaceFileWorkers(process.resourcesPath);
  workers = owner;
  app.once("will-quit", () => owner.close());
  return owner;
}

/** Initialized by Main after acquiring the native profile's instance lock. */
export function nativeWorkspaceCatalog() {
  const agentData = NativeDesktopProfile.agentData();
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
      ...NativeDesktopProfile.legacyRoots(app).metadataPaths(),
      agentData,
      app.getPath("temp"),
      DesktopMediaRoot.current(),
      ...(app.isPackaged ? [path.dirname(process.resourcesPath)] : []),
    ],
  });
}
