import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { NativeHookLaunchProfile } from "./native-agent-hooks";
import { pinExecutable, requirePrivateDirectory } from "./native-agent-hooks";

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
}>;

const MAX_ENVIRONMENT_BYTES = 24 * 1024;
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
    hooks?: NativeHookLaunchProfile
  ): Promise<NativeCommandProfile | undefined> {
    if (process.platform !== "darwin" && process.platform !== "linux")
      return undefined;
    const environment = await programEnvironment();
    if (hooks) {
      const { hooksOnly: _hooksOnly, ...command } = hooks.command;
      return { ...command, diskRead: true, environment };
    }
    const helper = await pinExecutable(
      path.join(resources, "native-agent", "agent-kit-sandbox-helper")
    );
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
      await fs.realpath(os.tmpdir()),
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
      helper,
      ...(process.platform === "linux"
        ? { bubblewrap: await pinExecutable("/usr/bin/bwrap") }
        : {}),
      runtimePaths,
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
    if (!path.isAbsolute(shell)) throw new Error("shell_invalid");
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        shell,
        ["-ilc", "/usr/bin/env -0"],
        {
          timeout: SHELL_TIMEOUT_MS,
          maxBuffer: 1024 * 1024,
          encoding: "utf8",
          env: { HOME: os.homedir(), USER: os.userInfo().username },
        },
        (error, stdout) => (error ? reject(error) : resolve(stdout))
      );
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
