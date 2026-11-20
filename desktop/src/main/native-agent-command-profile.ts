import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FxExtension } from "./fx-extension";
import type { NativeHookLaunchProfile } from "./native-agent-hooks";
import {
  commandTemporaryRoot,
  pinExecutable,
  requirePrivateDirectory,
} from "./native-agent-hooks";
import { NativeCommandRuntime } from "./native-command-runtime";

type Pin = Readonly<{ path: string; sha256: number[] }>;

/** The command block of a native launch profile under the Default preset. */
export type NativeCommandProfile = Readonly<{
  helper: Pin;
  bubblewrap?: Pin;
  runtimePaths: readonly string[];
  temporaryParent: string;
  diskRead: true;
  environment: Readonly<Record<string, string>>;
  hooksOnly?: true;
  bundledSkills?: readonly string[];
}>;

const MAX_ENVIRONMENT_BYTES = 24 * 1024;
const MAX_SHELL_OUTPUT_BYTES = 1024 * 1024;
const SHELL_TIMEOUT_MS = 4000;
/** Kept when the full environment is too large for a launch profile. */
const CORE_VARIABLES = [
  "PATH",
  "HOME",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "TMPDIR",
];

/**
 * Commands the agent runs behave as in the person's terminal: they start from
 * the login shell's environment and may read anywhere except protected stores.
 * See the permission policy's "What a program sees".
 */
export namespace NativeCommandProfiles {
  let captured: Promise<Record<string, string>> | undefined;

  /** The command block for a workspace, merged with any lifecycle hooks. */
  export async function launch(
    resources: string,
    workspace: string,
    hooks?: NativeHookLaunchProfile,
    protectedPaths: readonly string[] = []
  ): Promise<NativeCommandProfile | undefined> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      return undefined;
    const [shell, tools] = await Promise.all([
      programEnvironment(),
      FxExtension.command(resources).then((command) =>
        NativeCommandRuntime.prepare(
          resources,
          workspace,
          protectedPaths,
          command
        )
      ),
    ]);
    const environment = !tools.program
      ? shell
      : bounded({
          ...shell,
          PATH: [tools.program.directory, shell.PATH]
            .filter(Boolean)
            .join(path.delimiter),
        });
    const runtimeTools = tools.program
      ? {
          paths: [tools.program.directory],
          skills: { bundledSkills: [tools.program.skill] },
        }
      : { paths: [], skills: {} };
    if (hooks) {
      const { hooksOnly: _hooksOnly, ...command } = hooks.command;
      return {
        ...command,
        helper: tools.helper,
        runtimePaths: [...command.runtimePaths, ...runtimeTools.paths],
        ...runtimeTools.skills,
        diskRead: true,
        environment,
      };
    }
    const runtime =
      process.platform === "darwin"
        ? ["/usr/bin", "/bin", "/usr/lib", "/System/Library"]
        : ["/usr/bin", "/bin", "/usr/lib", "/lib", "/lib64"];
    const runtimePaths: string[] = [];
    for (const root of runtime) {
      try {
        runtimePaths.push(await fs.realpath(root));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const temporaryParent = path.join(
      await commandTemporaryRoot(),
      `grida-agent-commands-${createHash("sha256").update(workspace).digest("hex").slice(0, 24)}`
    );
    if (
      temporaryParent === workspace ||
      temporaryParent.startsWith(workspace + path.sep) ||
      workspace.startsWith(temporaryParent + path.sep)
    )
      throw new Error("native_command_temporary_scope_invalid");
    await fs.mkdir(temporaryParent, { mode: 0o700 }).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    await requirePrivateDirectory(temporaryParent);
    return {
      helper: tools.helper,
      ...(process.platform === "linux"
        ? { bubblewrap: await pinExecutable("/usr/bin/bwrap") }
        : {}),
      runtimePaths: [...runtimePaths, ...runtimeTools.paths],
      ...runtimeTools.skills,
      temporaryParent,
      diskRead: true,
      environment,
    };
  }

  /**
   * The person's login-shell environment, captured once per app run. A
   * desktop app's own environment lacks the shell's PATH and tool settings.
   * Falls back to this process's environment.
   */
  export function programEnvironment(): Promise<Record<string, string>> {
    captured ??= captureShell().catch(() => fromEntries(process.env));
    return captured.then(bounded);
  }

  async function captureShell(): Promise<Record<string, string>> {
    const shell = process.env.SHELL || "/bin/zsh";
    if (process.platform === "win32" || !path.isAbsolute(shell))
      throw new Error("shell_invalid");
    const homeDirectory = os.homedir();
    // Read login configuration once, outside any project and without access
    // to the launching terminal. Startup scripts may otherwise prompt there.
    const child = spawn(shell, ["-ilc", "/usr/bin/env -0"], {
      cwd: homeDirectory,
      env: { HOME: homeDirectory, USER: os.userInfo().username },
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    const output = await new Promise<string>((resolve, reject) => {
      const stopGroup = () => {
        if (child.pid !== undefined) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            // The probe's process group may have already exited.
          }
        }
      };
      const abandon = () => {
        // A shell can ignore SIGTERM, and a child it starts can hold stdout
        // open. Neither may keep workspace startup waiting for a close event.
        cleanup();
        stopGroup();
        child.stdout.destroy();
        reject(new Error("shell_environment_incomplete"));
      };
      const deadline = setTimeout(abandon, SHELL_TIMEOUT_MS);
      function cleanup() {
        clearTimeout(deadline);
        process.off("exit", stopGroup);
      }
      process.once("exit", stopGroup);
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_SHELL_OUTPUT_BYTES) abandon();
        else chunks.push(chunk);
      });
      child.stdout.once("error", abandon);
      child.once("error", reject);
      child.once("close", (code) => {
        cleanup();
        if (code === 0) resolve(Buffer.concat(chunks).toString("utf8"));
        else reject(new Error("shell_environment_incomplete"));
      });
    });
    const environment: Record<string, string> = {};
    for (const entry of output.split("\0")) {
      const separator = entry.indexOf("=");
      if (separator > 0)
        environment[entry.slice(0, separator)] = entry.slice(separator + 1);
    }
    if (!environment.PATH) throw new Error("shell_environment_incomplete");
    return environment;
  }

  function fromEntries(source: NodeJS.ProcessEnv): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(source))
      if (value !== undefined) environment[name] = value;
    return environment;
  }

  /** Drop app-internal variables and keep the profile within its size. */
  function bounded(source: Record<string, string>): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [name, value] of Object.entries(source)) {
      if (
        !name ||
        name.includes("=") ||
        name.includes("\0") ||
        value.includes("\0") ||
        name.startsWith("GRIDA_") ||
        name.startsWith("ELECTRON_")
      )
        continue;
      environment[name] = value;
    }
    if (Buffer.byteLength(JSON.stringify(environment)) <= MAX_ENVIRONMENT_BYTES)
      return environment;
    const core: Record<string, string> = {};
    for (const name of CORE_VARIABLES)
      if (environment[name] !== undefined) core[name] = environment[name];
    return core;
  }
}
