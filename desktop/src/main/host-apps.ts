/**
 * GRIDA-SEC-004 — curated native "Open in..." integration.
 *
 * This is a desktop platform capability, not an agent-core capability.
 * The renderer supplies closed app ids and a workspace id through the
 * desktop bridge; main resolves the workspace root through the sidecar
 * and opens only known host apps.
 */
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import {
  DESKTOP_HOST_APP_IDS,
  type DesktopHostAppId,
  type Workspace,
} from "../bridge/contract";

const execFileAsync = promisify(execFile);

export type HostAppId = DesktopHostAppId;

export type HostAppInfo = {
  id: HostAppId;
  label: string;
  installed: boolean;
  supports: Array<"workspace">;
};

type HostAppDefinition = {
  id: HostAppId;
  label: string;
  builtin?: boolean;
  macBundleId?: string;
  macPaths?: string[];
  linuxCommands?: string[];
  windowsCommands?: string[];
};

const HOST_APPS: readonly HostAppDefinition[] = [
  {
    id: "vscode",
    label: "VS Code",
    macBundleId: "com.microsoft.VSCode",
    macPaths: ["/Applications/Visual Studio Code.app"],
    linuxCommands: ["code"],
    windowsCommands: ["code.cmd", "code.exe"],
  },
  {
    id: "cursor",
    label: "Cursor",
    macBundleId: "com.todesktop.230313mzl4w4u92",
    macPaths: ["/Applications/Cursor.app"],
    linuxCommands: ["cursor"],
    windowsCommands: ["cursor.cmd", "cursor.exe"],
  },
  {
    id: "sublime",
    label: "Sublime Text",
    macBundleId: "com.sublimetext.4",
    macPaths: ["/Applications/Sublime Text.app"],
    linuxCommands: ["subl"],
    windowsCommands: ["subl.exe"],
  },
  {
    id: "finder",
    label: "Finder",
    builtin: true,
  },
  {
    id: "terminal",
    label: "Terminal",
    macBundleId: "com.apple.Terminal",
    macPaths: ["/System/Applications/Utilities/Terminal.app"],
  },
  {
    id: "warp",
    label: "Warp",
    macBundleId: "dev.warp.Warp-Stable",
    macPaths: ["/Applications/Warp.app"],
    linuxCommands: ["warp-terminal"],
  },
  {
    id: "xcode",
    label: "Xcode",
    macBundleId: "com.apple.dt.Xcode",
    macPaths: ["/Applications/Xcode.app"],
  },
] as const;

const HOST_APP_BY_ID = new Map<HostAppId, HostAppDefinition>(
  HOST_APPS.map((app) => [app.id, app])
);

export function allHostAppIds(): readonly HostAppId[] {
  return DESKTOP_HOST_APP_IDS;
}

export function isHostAppId(id: string): id is HostAppId {
  return (DESKTOP_HOST_APP_IDS as readonly string[]).includes(id);
}

export async function resolvePreferredHostApps(
  preferred: readonly HostAppId[]
): Promise<HostAppInfo[]> {
  const seen = new Set<HostAppId>();
  const apps = preferred.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return await Promise.all(apps.map(resolveHostApp));
}

export async function openWorkspaceInHostApp(
  appId: HostAppId,
  workspace: Workspace
): Promise<void> {
  const app = HOST_APP_BY_ID.get(appId);
  if (!app) throw new Error(`unknown host app: ${appId}`);
  const installed = await isInstalled(app);
  if (!installed) throw new Error(`host app is not installed: ${appId}`);

  const root = workspace.root;
  if (process.platform === "darwin") {
    await openWorkspaceDarwin(app, root);
    return;
  }
  if (process.platform === "linux") {
    await openWorkspaceLinux(app, root);
    return;
  }
  if (process.platform === "win32") {
    await openWorkspaceWindows(app, root);
    return;
  }
  throw new Error(`unsupported platform: ${process.platform}`);
}

async function resolveHostApp(appId: HostAppId): Promise<HostAppInfo> {
  const app = HOST_APP_BY_ID.get(appId);
  if (!app) {
    return { id: appId, label: appId, installed: false, supports: [] };
  }
  return {
    id: app.id,
    label: labelForHostApp(app),
    installed: await isInstalled(app),
    supports: ["workspace"],
  };
}

function labelForHostApp(app: HostAppDefinition): string {
  if (app.id !== "finder") return app.label;
  if (process.platform === "darwin") return "Finder";
  if (process.platform === "win32") return "File Explorer";
  return "File Manager";
}

async function isInstalled(app: HostAppDefinition): Promise<boolean> {
  if (app.builtin) return true;
  if (process.platform === "darwin") return await isInstalledDarwin(app);
  if (process.platform === "linux")
    return (await resolveCommand(app.linuxCommands)) !== null;
  if (process.platform === "win32")
    return (await resolveCommand(app.windowsCommands, "where")) !== null;
  return false;
}

async function isInstalledDarwin(app: HostAppDefinition): Promise<boolean> {
  for (const appPath of app.macPaths ?? []) {
    try {
      const stat = await fs.stat(appPath);
      if (stat.isDirectory()) return true;
    } catch {
      // Try the next known path / Spotlight fallback.
    }
  }
  if (!app.macBundleId) return false;
  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/mdfind",
      [`kMDItemCFBundleIdentifier == '${app.macBundleId}'`],
      { timeout: 1500 }
    );
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function resolveCommand(
  commands: readonly string[] | undefined,
  resolver = "which"
): Promise<string | null> {
  for (const command of commands ?? []) {
    try {
      await execFileAsync(resolver, [command], { timeout: 1000 });
      return command;
    } catch {
      // Keep looking.
    }
  }
  return null;
}

async function openWorkspaceDarwin(
  app: HostAppDefinition,
  workspaceRoot: string
) {
  if (app.id === "finder") {
    await execFileAsync("/usr/bin/open", [workspaceRoot]);
    return;
  }
  if (app.macBundleId) {
    await execFileAsync("/usr/bin/open", [
      "-b",
      app.macBundleId,
      workspaceRoot,
    ]);
    return;
  }
  throw new Error(`host app cannot open workspaces on macOS: ${app.id}`);
}

async function openWorkspaceLinux(
  app: HostAppDefinition,
  workspaceRoot: string
) {
  if (app.id === "finder") {
    await execFileAsync("xdg-open", [workspaceRoot]);
    return;
  }
  const command = await resolveCommand(app.linuxCommands);
  if (!command)
    throw new Error(`host app cannot open workspaces on Linux: ${app.id}`);
  await execFileAsync(command, [workspaceRoot]);
}

/**
 * Reject a path that carries cmd.exe control characters. Used only on the
 * `cmd.exe /c <launcher.cmd> <path>` branch, where cmd re-parses argv.
 * Legitimate Windows paths (drive letters, backslashes, spaces, unicode,
 * parentheses) pass; command-chaining / redirection / env-expansion chars
 * do not.
 */
function assertNoCmdMetacharacters(p: string): void {
  if (/[&|<>^"%\r\n]/.test(p)) {
    throw new Error(
      "refusing to open workspace: path contains characters unsafe for cmd.exe"
    );
  }
}

async function openWorkspaceWindows(
  app: HostAppDefinition,
  workspaceRoot: string
) {
  if (app.id === "finder") {
    await execFileAsync("explorer.exe", [workspaceRoot]);
    return;
  }
  const command = await resolveCommand(app.windowsCommands, "where");
  if (!command)
    throw new Error(`host app cannot open workspaces on Windows: ${app.id}`);
  if (command.endsWith(".cmd") || command.endsWith(".bat")) {
    // GRIDA-SEC-004: cmd.exe re-parses its argv, so a workspace path
    // containing cmd metacharacters (& | < > ^ " %) would be interpreted
    // as command separators / env expansion rather than a literal path —
    // i.e. directory-name → arbitrary command execution. Reject such
    // paths instead of trying to escape them (cmd quoting is unreliable).
    // The direct-.exe path below spawns without a shell and is unaffected.
    assertNoCmdMetacharacters(workspaceRoot);
    await execFileAsync("cmd.exe", ["/d", "/c", command, workspaceRoot]);
    return;
  }
  await execFileAsync(command, [workspaceRoot]);
}
