// GRIDA-GG: desktop — pass the GG host into the sandbox policy (docs/wg/platform/hosted-ai.md)
/**
 * GRIDA-SEC-004 — AgentSidecar supervisor.
 *
 * Spawns and supervises the agent sidecar, now **inside `srt`**.
 * Lifecycle:
 *
 *   1. On first `start()`:
 *      - Generate a 256-bit per-spawn Basic-Auth password.
 *      - Build the outer-wrap policy from build-time config +
 *        the host's userData path.
 *      - `await ensureInitialized(policy)` — spins up srt's
 *        HTTP/SOCKS5 proxies.
 *      - Build the sidecar command line (Electron-as-node +
 *        sidecar bin + argv) and `await wrap(cmd)` to get the
 *        sandbox-wrapped shell string.
 *      - `child_process.spawn(wrapped, { shell: true, env, stdio })`.
 *
 *   2. On unexpected child exit: restart with exponential backoff
 *      (250ms → 10s). The wrap is recomputed each time —
 *      `ensureInitialized` is a no-op on subsequent calls (proxies
 *      stay up).
 *
 *   3. On `before-quit`: kill the child, `await dispose()` to tear
 *      srt's proxies down.
 *
 * Switching from `utilityProcess.fork` to `child_process.spawn`
 * means we re-exec Electron's own binary in Node mode
 * (`ELECTRON_RUN_AS_NODE=1`). The `RunAsNode` fuse in
 * `forge.config.ts` MUST be `true` for this to work in packaged
 * builds; dev electron honours the env var regardless.
 *
 * The password is held in this module's closure and crosses to the
 * agent sidecar over stdin (NOT argv, NOT env, NOT disk).
 *
 * Windows behaviour: `srt` doesn't support Windows. On Windows we
 * fall back to the unwrapped path (still using
 * `child_process.spawn` + Electron-as-node so the spawn model is
 * uniform) but log a loud warning. A real Windows backend is
 * tracked in `docs/wg/desktop/agent-sandbox-wrap.md`.
 */
import { app } from "electron";
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildAgentDaemonSandboxPolicy } from "@grida/agent/sandbox";
import { home } from "@grida/home";
import {
  ensureInitialized,
  wrap,
  dispose,
  isSupportedPlatform,
  checkDependencies,
} from "./sandbox/manager";
import { SidecarLogWriter } from "./sidecar-log";
import { EDITOR_BASE_URL } from "../env";

export type AgentSidecarInfo = {
  /** TCP port the agent sidecar is listening on (127.0.0.1 only). */
  port: number;
  /** Per-spawn Basic-Auth password. Main process only; preload requests it over guarded IPC. */
  password: string;
};

const PORT_LINE_PREFIX = "PORT=";
const STARTUP_TIMEOUT_MS = 15_000; // bumped from 8s — srt init adds proxy startup time
const BACKOFF_INITIAL_MS = 250;
const BACKOFF_MAX_MS = 10_000;

class AgentSidecarSupervisor {
  private child: ChildProcess | null = null;
  private info: AgentSidecarInfo | null = null;
  private restartBackoffMs = BACKOFF_INITIAL_MS;
  private isShuttingDown = false;
  private restartTimer: NodeJS.Timeout | null = null;
  private sandboxReady = false;

  // The agent's data dir: the canonical Grida home + the "agent" component
  // (~/.grida/agent). Resolved ONCE so the sandbox write-allowlist and the
  // sidecar's `--user-data` argv cannot diverge (GRIDA-SEC-004). Uses
  // os.homedir() (== app.getPath("home")) so it is safe to compute at module
  // construction, before Electron is ready. Electron's own
  // app.getPath("userData") (Chromium cookies/cache/window state) is left
  // untouched — mirrors codex keeping ~/.codex separate from its GUI shell dir.
  private readonly user_data_path = home.join("agent");

  // Durable sidecar log (~/.grida/agent/logs/sidecar.log) — the on-disk
  // trace a packaged-app incident needs (the console is gone by the time
  // anyone looks).
  private readonly log = new SidecarLogWriter(
    path.join(this.user_data_path, "logs")
  );

  /** One statement per event: mirror to the console AND the durable log so
   * a lifecycle line can never land console-only. */
  private note(
    stream: "out" | "err" | "sup",
    line: string,
    level: "log" | "warn" | "error" = "log"
  ): void {
    const prefix = stream === "err" ? "[agent-sidecar:err]" : "[agent-sidecar]";
    // eslint-disable-next-line no-console
    console[level](`${prefix} ${line}`);
    this.log.write(stream, line);
  }

  constructor() {
    app.on("before-quit", () => {
      this.isShuttingDown = true;
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      this.stop();
      // Fire-and-forget — Electron's `before-quit` doesn't await
      // listeners. `dispose()` is best-effort; the OS reclaims srt's
      // proxy sockets at process exit regardless.
      void dispose();
    });
  }

  async start(): Promise<AgentSidecarInfo> {
    if (this.info) return this.info;
    if (!this.sandboxReady) {
      await this.initSandbox();
    }
    return await this.spawn();
  }

  getInfo(): AgentSidecarInfo | null {
    return this.info;
  }

  stop() {
    if (this.child) {
      try {
        this.child.kill("SIGTERM");
      } catch {
        // already dead
      }
      this.child = null;
    }
    this.info = null;
  }

  /**
   * One-shot srt bring-up. Builds the outer policy from build-time
   * config and the host's userData path, runs dependency checks
   * (Linux: bubblewrap + socat + ripgrep), and initializes the
   * proxies. Called once per Electron launch.
   */
  private async initSandbox(): Promise<void> {
    if (this.sandboxReady) return;
    if (!isSupportedPlatform()) {
      // Windows or another unsupported platform. Log loudly and let
      // the spawn proceed unwrapped — the alternative is refusing
      // to start at all, which would brick the app on Windows.
      // GRIDA-SEC-004 layers (Basic Auth, Origin/Referer) still
      // apply at the HTTP boundary.
      console.warn(
        "[agent-sidecar:srt] platform not supported by sandbox-runtime — " +
          "starting agent sidecar WITHOUT srt wrap. Tracked in " +
          "docs/wg/desktop/agent-sandbox-wrap.md"
      );
      this.sandboxReady = true;
      return;
    }
    const deps = checkDependencies();
    if (deps) {
      for (const warning of deps.warnings ?? []) {
        console.warn(`[agent-sidecar:srt] dep warning: ${warning}`);
      }
      for (const error of deps.errors ?? []) {
        console.error(`[agent-sidecar:srt] dep error: ${error}`);
      }
      // We deliberately don't bail on errors here — srt's
      // `initialize()` will throw with a clearer per-dep message
      // (e.g. "bwrap not found in PATH"). Letting it throw means
      // one error path, not two.
    }
    const policy = buildAgentDaemonSandboxPolicy({
      user_data: this.user_data_path,
      home: app.getPath("home"),
      // GRIDA-SEC-006 — without this, the srt egress allowlist 403s the
      // grida hosted provider's calls to the editor origin.
      gg_host: new URL(EDITOR_BASE_URL).hostname,
    });
    await ensureInitialized({
      network: {
        allowedDomains: policy.network.allowed_domains,
        deniedDomains: policy.network.denied_domains,
        allowLocalBinding: policy.network.allow_local_binding,
      },
      filesystem: {
        denyRead: policy.filesystem.deny_read,
        allowRead: policy.filesystem.allow_read,
        allowWrite: policy.filesystem.allow_write,
        denyWrite: policy.filesystem.deny_write,
      },
    });
    this.sandboxReady = true;
  }

  /**
   * Resolve the sidecar bin path on disk. Forge's Vite plugin emits
   * `.vite/build/agent-sidecar.js` next to `main.js`. In packaged builds
   * `__dirname` is inside the asar; the bundled sidecar script lives
   * alongside, and Electron's asar transparent-read serves it when
   * we `spawn` Electron-as-node with that path.
   */
  private sidecarScriptPath(): string {
    return path.join(__dirname, "agent-sidecar.js");
  }

  /**
   * Resolve the host-bundled skills dir (repo-root `skills/`) — the lowest
   * discovery layer that ships the built-in `svg`/`dotcanvas`/`slides` skills.
   * Packaged: Forge `extraResource` copies `skills/` into `resourcesPath`. Dev:
   * it sits beside the desktop package dir (`app.getAppPath()` = `desktop/`).
   * Returns undefined if neither exists (the sidecar then ships no built-ins).
   */
  private skillsRootPath(): string | undefined {
    const packaged = path.join(process.resourcesPath, "skills");
    if (fs.existsSync(packaged)) return packaged;
    const dev = path.join(app.getAppPath(), "..", "skills");
    if (fs.existsSync(dev)) return dev;
    return undefined;
  }

  private async spawn(): Promise<AgentSidecarInfo> {
    const scriptPath = this.sidecarScriptPath();
    const password = crypto.randomBytes(32).toString("base64url");

    // `wrap()` returns the sandbox-wrapped shell string. On
    // unsupported platforms, avoid shell quoting entirely and spawn
    // Electron-as-node with an argv array so Windows paths with spaces
    // work under cmd.exe.
    const supportedSandbox = isSupportedPlatform();

    const skillsRoot = this.skillsRootPath();
    const args = [
      scriptPath,
      `--user-data=${this.user_data_path}`,
      // Host-bundled skills dir (repo-root `skills/`) — the built-in skills the
      // agent advertises + loads on demand. Read-only; omitted if unresolved.
      ...(skillsRoot ? [`--skills-root=${skillsRoot}`] : []),
      // GRIDA-SEC-004 — host-injected managed root for the auto-create flow.
      // A visible, Finder-navigable location (files stay visible); the sidecar
      // may only mint project folders INSIDE this root. `documents` needs a
      // ready app, which holds at spawn time (post `app.whenReady`).
      `--projects-root=${path.join(app.getPath("documents"), "Grida")}`,
      `--editor-base-url=${EDITOR_BASE_URL}`,
      // GRIDA-SEC-004 — tell the sidecar whether srt wraps this spawn. Only
      // then does it expose the `run_command` shell tool (fail-closed). On
      // platforms srt can't wrap, this is "0" and the agent gets no shell.
      `--sandbox-enforced=${supportedSandbox ? "1" : "0"}`,
    ];
    let wrappedCmd: string | null = null;
    if (supportedSandbox) {
      // The shell command we want to run — Electron's own binary in
      // Node mode, the sidecar script, and `--user-data=...` on argv[2].
      // Quoting is critical: paths can contain spaces on macOS
      // ("Application Support"). The password is not on argv; it is
      // written to child stdin after spawn.
      const cmd = [shellQuote(process.execPath), ...args.map(shellQuote)].join(
        " "
      );
      wrappedCmd = await wrap(cmd);
    }

    return await new Promise<AgentSidecarInfo>((resolve, reject) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        this.note("sup", "startup timed out; stopping child", "warn");
        this.stop();
        reject(new Error("agent sidecar startup timed out"));
      }, STARTUP_TIMEOUT_MS);

      // Strip proxy env vars from the spawn environment. Two reasons,
      // in order of importance:
      //
      // 1. srt's outer wrap re-injects HTTP_PROXY / HTTPS_PROXY /
      //    ALL_PROXY pointing at its own in-process proxies (where
      //    `main/sandbox/policy.ts`'s allowlist actually lives). If
      //    we let the launching shell's proxy env leak through, it
      //    races with srt's values — and on some macOS shells the
      //    inherited value wins, which routes the sidecar's BYOK
      //    calls through a localhost proxy that has no idea about
      //    `openrouter.ai`. Concrete failure mode: launching Grida
      //    from a sandbox shell (Claude Code, mitmproxy session,
      //    corporate VPN client) ends up with the sidecar talking to
      //    that outer sandbox's proxy instead of Grida's own.
      //
      // 2. With the strip in place, srt is the only source of truth
      //    for the sidecar's proxy env. `agent-sidecar.ts` then sets an
      //    `EnvHttpProxyAgent` as undici's global dispatcher so
      //    Node's fetch actually routes through that proxy — without
      //    the dispatcher, the env vars do nothing because undici v6+
      //    no longer reads them on its own.
      //
      // This block is small but load-bearing; both halves of the fix
      // (this strip + the dispatcher in agent-sidecar.ts) are required.
      const cleanedEnv: NodeJS.ProcessEnv = { ...process.env };
      for (const key of [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "NO_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
        "no_proxy",
      ]) {
        delete cleanedEnv[key];
      }

      // Pass through env (minus proxy vars; see above), then overlay
      // ELECTRON_RUN_AS_NODE=1 so Electron boots as Node and runs the
      // sidecar script. The `RunAsNode` fuse in forge.config.ts must be
      // `true` for packaged builds; dev electron honours the env always.
      const childEnv: NodeJS.ProcessEnv = {
        ...cleanedEnv,
        ELECTRON_RUN_AS_NODE: "1",
      };
      const child = supportedSandbox
        ? spawn(wrappedCmd!, {
            shell: true,
            env: childEnv,
            stdio: ["pipe", "pipe", "pipe"],
          })
        : spawn(process.execPath, args, {
            shell: false,
            env: childEnv,
            stdio: ["pipe", "pipe", "pipe"],
          });
      this.child = child;
      this.note(
        "sup",
        `spawned pid=${child.pid ?? "?"} sandbox=${supportedSandbox ? "srt" : "none"}`
      );
      child.stdin?.end(`${password}\n`);

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          if (trimmed.startsWith(PORT_LINE_PREFIX)) {
            const port = Number(trimmed.slice(PORT_LINE_PREFIX.length));
            if (Number.isFinite(port) && port > 0 && port < 65536) {
              this.info = { port, password };
              this.restartBackoffMs = BACKOFF_INITIAL_MS;
              this.note("sup", `listening port=${port}`);
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(this.info);
              }
            }
          } else {
            this.note("out", trimmed);
          }
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.length > 0) this.note("err", trimmed, "error");
        }
      });

      child.on("exit", (code, signal) => {
        this.note(
          "sup",
          `exited code=${code}${signal ? ` signal=${signal}` : ""}`,
          "warn"
        );
        this.info = null;
        this.child = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(
            new Error(
              `agent sidecar exited before listening (code=${code} signal=${signal ?? "none"})`
            )
          );
          return;
        }
        if (this.isShuttingDown) return;
        this.scheduleRestart();
      });

      child.on("error", (err) => {
        // `error` fires for spawn failures (ENOENT etc.). Treat as
        // a startup failure if we haven't resolved yet; otherwise
        // log and let `exit` handle cleanup.
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.note("sup", `spawn failed: ${err.message}`, "error");
          reject(new Error(`agent sidecar spawn failed: ${err.message}`));
        } else {
          this.note("sup", `spawn error: ${err.message}`, "error");
        }
      });
    });
  }

  private handleRestartFailure(err: unknown): void {
    this.note(
      "sup",
      `restart failed: ${err instanceof Error ? err.message : String(err)}`,
      "error"
    );
    this.scheduleRestart();
  }

  /**
   * Schedule a single backoff restart. Idempotent: if a restart timer is
   * already pending (or we're shutting down) this is a no-op. That dedup is
   * load-bearing — the startup-timeout path triggers BOTH a rejected respawn
   * promise (→ handleRestartFailure) AND the SIGTERM'd child's `exit` event,
   * and without it both would schedule a timer and spawn two concurrent
   * sidecars (one leaked, since only the second is tracked in `this.child`).
   */
  private scheduleRestart(): void {
    if (this.isShuttingDown || this.restartTimer) return;
    const wait = this.restartBackoffMs;
    this.restartBackoffMs = Math.min(this.restartBackoffMs * 2, BACKOFF_MAX_MS);
    this.note("sup", `restart in ${wait}ms`, "warn");
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.isShuttingDown) return;
      this.spawn().catch((err) => this.handleRestartFailure(err));
    }, wait);
  }
}

/**
 * Minimal shell-quote — wraps a string in single quotes and
 * escapes embedded single quotes. We need this because `wrap`
 * returns a shell string and the sidecar path / userData path can
 * contain spaces and other shell-meaningful characters (especially
 * "Application Support" on macOS). srt itself uses `shell-quote`
 * internally; we replicate the discipline here for our own pieces.
 */
function shellQuote(s: string): string {
  if (s.length === 0) return "''";
  // POSIX-portable single-quote escape: close, escape, reopen.
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const supervisor = new AgentSidecarSupervisor();

export function startAgentSidecar(): Promise<AgentSidecarInfo> {
  return supervisor.start();
}

export function getAgentSidecarInfo(): AgentSidecarInfo | null {
  return supervisor.getInfo();
}

export function stopAgentSidecar() {
  supervisor.stop();
}
