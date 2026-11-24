// GRIDA-SEC-004 / GRIDA-SEC-014 — native file and media scope selection.
import { app } from "electron";
import path from "node:path";
import { buildDaemonSandboxPolicy } from "@grida/daemon/sandbox";
import type { DesktopProfile } from "./desktop-profile";
import { NativeDesktopProfile } from "./native-desktop-profile";
import { NativeDocumentFiles } from "./native-document-files";
import { WorkspaceFileWorkers } from "./workspace-file-worker";
import { NativeWorkspaceCatalog } from "./native-workspace-catalog";

export function nativeWorkspaceMedia(profile: DesktopProfile) {
  if (profile.nativeChat !== "preview" || !nativeFilePlatform()) return;
  return fileWorkers(profile.resourcesPath);
}

/** Ordinary Desktop uses a selected-file owner independently of its workspace registry. */
export function ordinarySelectedSvgFiles(
  profile: DesktopProfile,
  identityDirectory?: string,
  protectedPaths: readonly string[] = []
) {
  if (!nativeFilePlatform() || (!identityDirectory && !profile.agentDisabled))
    return;
  const agentData = path.resolve(profile.agentData);
  const { filesystem } = buildDaemonSandboxPolicy({
    user_data: agentData,
    home: profile.userHome,
  });
  return new NativeDocumentFiles(
    [
      ...protectedPaths,
      ...(NativeDesktopProfile.installedRootsForDevelopment(
        app,
        profile
      )?.metadataPaths() ?? []),
      ...filesystem.deny_read,
      profile.gridaHome,
      agentData,
      profile.userData,
      profile.sessionData,
      profile.mediaRoot,
      path.dirname(profile.resourcesPath),
    ],
    profile.userHome,
    fileWorkers(profile.resourcesPath),
    identityDirectory
  );
}

function nativeFilePlatform(): boolean {
  // This selected-document worker uses Seatbelt; Linux retains its file owner.
  return process.platform === "darwin";
}

function fileWorkers(resourcesPath: string): WorkspaceFileWorkers {
  const owner = new WorkspaceFileWorkers(resourcesPath);
  app.once("will-quit", () => owner.close());
  return owner;
}

/** Initialized by Main after acquiring the native profile's instance lock. */
export function nativeWorkspaceCatalog(profile: DesktopProfile) {
  const agentData = profile.agentDataOverride;
  if (!agentData || !path.isAbsolute(agentData))
    throw new Error("workspace_catalog_profile_invalid");
  const { filesystem } = buildDaemonSandboxPolicy({
    user_data: agentData,
    home: profile.userHome,
  });
  return new NativeWorkspaceCatalog({
    browserData: profile.userData,
    projectsRoot: profile.projectsRoot,
    protectedPaths: [
      ...filesystem.deny_read,
      ...NativeDesktopProfile.protectedRoots(app).metadataPaths(),
      agentData,
      profile.temp,
      profile.mediaRoot,
      ...(profile.isPackaged ? [path.dirname(profile.resourcesPath)] : []),
    ],
  });
}
