// GRIDA-SEC-004 / GRIDA-SEC-016 — pin app resources and bind FX to the admitted workspace.
import fs from "node:fs/promises";
import path from "node:path";
import type { App } from "electron";
import { ProtectedRoots } from "@grida/daemon/server";
import definition from "../fx-extension.json";
import type { DesktopBrowserTools } from "./desktop-browser-tools";
import { FxViewer } from "./fx-viewer";
import { FxWorkspaceFiles } from "./fx-workspace-files";
import { pinExecutable } from "./native-agent-hooks";
import { NativeDesktopProfile } from "./native-desktop-profile";
import type { servicesSidecarClient } from "./services-sidecar-client";

type WorkspaceFiles = Pick<
  typeof servicesSidecarClient,
  "findWorkspace" | "readWorkspaceDirectory" | "readWorkspaceFile"
>;

export class FxExtension {
  readonly viewer: FxViewer;

  constructor(
    desktopApp: () => App,
    private readonly workspace: WorkspaceFiles
  ) {
    let command: ReturnType<typeof FxExtension.command> | undefined;
    let protectedRoots: ProtectedRoots | undefined;
    this.viewer = new FxViewer(
      async (workspaceId) => {
        const registered = await this.workspace.findWorkspace(workspaceId);
        if (registered?.id !== workspaceId) return undefined;
        protectedRoots ??= NativeDesktopProfile.selected()
          ? NativeDesktopProfile.protectedRoots(desktopApp())
          : new ProtectedRoots(
              NativeDesktopProfile.ordinaryChatProtectedPaths(desktopApp())
            );
        return protectedRoots.overlaps(registered.root)
          ? undefined
          : FxViewer.projectDirectory(registered.root);
      },
      async (args, signal) => {
        command ??= FxExtension.command(
          NativeDesktopProfile.resourcesPath(desktopApp())
        ).catch(() => {
          command = undefined;
          return undefined;
        });
        const program = await command;
        return program && !signal.aborted
          ? FxViewer.run(program.path, args, signal)
          : null;
      }
    );
  }

  files(browser: Pick<DesktopBrowserTools, "activateFxViewerFile">) {
    return new FxWorkspaceFiles(browser, {
      list: this.workspace.readWorkspaceDirectory,
      bytes: async (workspaceId, relativePath, signal) => {
        const result = await this.workspace.readWorkspaceFile(
          workspaceId,
          relativePath,
          "bytes",
          signal
        );
        if (!("base64" in result))
          throw new Error("workspace_file_unavailable");
        return result;
      },
    });
  }

  /** The installed artifact is authoritative for host-owned FX invocations. */
  static async command(resources: string) {
    if (
      !Object.hasOwn(
        definition.platformPackages,
        `${process.platform}-${process.arch}`
      )
    )
      return undefined;
    const carrier = path.join(
      await fs.realpath(resources),
      definition.resourceDirectory
    );
    try {
      for (const directory of [carrier, path.join(carrier, "bin")]) {
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || (stat.mode & 0o022) !== 0)
          throw new Error("bundled_program_directory_invalid");
      }
      const executable = path.join(carrier, "bin", definition.command);
      const pin = await pinExecutable(executable);
      if (pin.path !== executable)
        throw new Error("bundled_program_path_invalid");
      const versionPath = path.join(carrier, definition.versionFile);
      const stat = await fs.lstat(versionPath);
      if (!stat.isFile() || stat.size > 64 || (stat.mode & 0o022) !== 0)
        throw new Error("bundled_program_version_invalid");
      const version = (await fs.readFile(versionPath, "utf8")).trim();
      if (!/^\d+\.\d+\.\d+$/.test(version))
        throw new Error("bundled_program_version_invalid");
      return { ...pin, version, skill: definition.skill };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }
}
