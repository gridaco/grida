// GRIDA-SEC-010 — explicit local registration and independent native custody.
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { AuthClient } from "@grida/auth";
import type { createPersistentNativeAuth } from "@grida/auth/node";

/** Trusted CLI composition. Hosted registration is intentionally not provisioned. */
export namespace CliHost {
  export type Runtime = Awaited<ReturnType<typeof createPersistentNativeAuth>>;
  export type Options = {
    storage?: "keyring" | "file";
    noBrowser?: boolean;
    /** Explicit manual-login output, supplied by the CLI's stderr owner. */
    onAuthorizationUrl?: (url: string) => void | Promise<void>;
  };

  export class Failure extends Error {
    readonly name = "CliHost.Failure";
    constructor(
      readonly code: "not_configured" | "invalid_config" | "browser_failed"
    ) {
      super(
        code === "not_configured"
          ? "Local CLI authentication is not configured."
          : code === "invalid_config"
            ? "The local CLI configuration is invalid."
            : "The authorization browser could not be opened."
      );
    }
  }

  /** Env is a process-level host input; no repository or dotenv lookup occurs. */
  export async function open(
    options: Options = {},
    env: NodeJS.ProcessEnv = process.env
  ): Promise<Runtime> {
    const configPath = env.GRIDA_CLI_LOCAL_CONFIG;
    const home = env.GRIDA_HOME;
    const storage = options.storage;
    const noBrowser = options.noBrowser;
    const output = options.onAuthorizationUrl;
    if (configPath === undefined || configPath === "")
      throw new Failure("not_configured");
    if (
      !absolute(configPath) ||
      !absolute(home) ||
      (storage !== undefined && storage !== "file" && storage !== "keyring") ||
      (noBrowser !== undefined && typeof noBrowser !== "boolean") ||
      (noBrowser === true ? typeof output !== "function" : output !== undefined)
    )
      throw new Failure("invalid_config");

    // Snapshot the small browser environment before any await. Credentials,
    // BROWSER, loader hooks, proxy variables and shell options are never copied.
    const browserEnv = systemBrowserEnvironment(env);
    await validateHome(home);
    const config = await registration(configPath);
    // Keep help/version independent of native credential modules and their I/O.
    const { createPersistentNativeAuth } = await import("@grida/auth/node");
    return createPersistentNativeAuth(config, {
      home,
      ...(storage === undefined ? {} : { storage }),
      async openBrowser(url) {
        validateAuthorizationUrl(url, config);
        if (noBrowser) {
          try {
            await output!(url);
          } catch {
            throw new Failure("browser_failed");
          }
          return;
        }
        await launchSystemBrowser(url, browserEnv);
      },
    });
  }
}

const issuer = "http://127.0.0.1:55431/auth/v1";
const apiOrigin = "http://127.0.0.1:3041";
const callbacks = new Set([
  "http://127.0.0.1:55435/callback",
  "http://127.0.0.1:55436/callback",
]);

function absolute(value: unknown): value is string {
  return (
    typeof value === "string" && !value.includes("\0") && path.isAbsolute(value)
  );
}

async function validateHome(value: string): Promise<void> {
  try {
    const userHome = homedir();
    const paths = await Promise.all([
      canonicalPath(value),
      canonicalPath(userHome),
      canonicalPath(path.join(userHome, ".grida")),
    ]);
    // macOS commonly uses a case-insensitive filesystem. Conservatively reject
    // spelling aliases there even if a particular volume is case-sensitive.
    const [directory, canonicalUserHome, ordinaryHome] = paths.map((value) =>
      process.platform === "darwin" ? value.toLowerCase() : value
    );
    if (
      directory === path.parse(directory).root ||
      directory === canonicalUserHome ||
      directory === ordinaryHome ||
      directory.startsWith(ordinaryHome + path.sep)
    )
      throw new Error();
  } catch {
    throw new CliHost.Failure("invalid_config");
  }
}

/** Resolve existing ancestors without creating a home or reading its contents. */
async function canonicalPath(value: string): Promise<string> {
  let existing = path.resolve(value);
  const missing: string[] = [];
  while (true) {
    try {
      return path.join(await realpath(existing), ...missing);
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        error.code !== "ENOENT" ||
        path.dirname(existing) === existing
      )
        throw error;
      missing.unshift(path.basename(existing));
      existing = path.dirname(existing);
    }
  }
}

async function registration(configPath: string): Promise<AuthClient.Config> {
  // A public registration file carries destination authority. Read one bounded
  // regular file, refusing a symlink, device, shared writer or oversized input.
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file = await open(
      configPath,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK
    );
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.size < 1 ||
      stat.size > 8192 ||
      stat.nlink !== 1 ||
      (stat.mode & 0o022) !== 0 ||
      (process.getuid !== undefined && stat.uid !== process.getuid())
    )
      throw new CliHost.Failure("invalid_config");
    const bytes = Buffer.alloc(8193);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new CliHost.Failure("invalid_config");
    const data: unknown = JSON.parse(
      bytes.subarray(0, bytesRead).toString("utf8")
    );
    if (
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data) ||
      Object.keys(data).sort().join(",") !==
        "apiOrigin,clientId,issuer,redirectUris"
    )
      throw new CliHost.Failure("invalid_config");
    const config = data as Record<string, unknown>;
    if (
      typeof config.clientId !== "string" ||
      !/^[A-Za-z0-9_-]{1,256}$/.test(config.clientId) ||
      config.issuer !== issuer ||
      config.apiOrigin !== apiOrigin ||
      !Array.isArray(config.redirectUris) ||
      config.redirectUris.length < 1 ||
      config.redirectUris.length > 2 ||
      config.redirectUris.some((uri) => !callbacks.has(uri)) ||
      new Set(config.redirectUris).size !== config.redirectUris.length
    )
      throw new CliHost.Failure("invalid_config");
    return Object.freeze({
      clientId: config.clientId,
      issuer,
      apiOrigin,
      redirectUris: Object.freeze([
        ...config.redirectUris,
      ]) as readonly string[],
    });
  } catch {
    throw new CliHost.Failure("invalid_config");
  } finally {
    await file?.close().catch(() => undefined);
  }
}

function validateAuthorizationUrl(value: string, config: AuthClient.Config) {
  try {
    if (
      value.length > 8192 ||
      value.includes("\r") ||
      value.includes("\n") ||
      value.includes("\0")
    )
      throw new Error();
    const url = new URL(value);
    if (
      url.href !== value ||
      url.origin + url.pathname !== `${config.issuer}/oauth/authorize` ||
      url.username !== "" ||
      url.password !== "" ||
      url.hash !== ""
    )
      throw new Error();
  } catch {
    throw new CliHost.Failure("browser_failed");
  }
}

function systemBrowserEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
  for (const key of [
    "HOME",
    "USER",
    "LOGNAME",
    "LANG",
    "LC_ALL",
    "DISPLAY",
    "WAYLAND_DISPLAY",
    "XDG_RUNTIME_DIR",
    "XDG_CURRENT_DESKTOP",
    "XDG_SESSION_TYPE",
    "DBUS_SESSION_BUS_ADDRESS",
  ]) {
    if (env[key] !== undefined) result[key] = env[key];
  }
  return result;
}

function launchSystemBrowser(
  url: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const platform = process.platform;
  if (platform !== "darwin" && platform !== "linux")
    return Promise.reject(new CliHost.Failure("browser_failed"));
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(
        platform === "darwin" ? "/usr/bin/open" : "/usr/bin/xdg-open",
        platform === "darwin" ? ["--", url] : [url],
        { shell: false, stdio: "ignore", env }
      );
    } catch {
      reject(new CliHost.Failure("browser_failed"));
      return;
    }
    let settled = false;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (success) resolve();
      else reject(new CliHost.Failure("browser_failed"));
    };
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // The same fixed failure covers a launcher that cannot be terminated.
      }
      finish(false);
    }, 10_000);
    child.once("error", () => finish(false));
    child.once("exit", (code) => finish(code === 0));
  });
}
