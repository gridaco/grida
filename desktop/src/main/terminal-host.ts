/**
 * GRIDA-SEC-004 — human-interactive terminal PTY host.
 *
 * Owns every PTY the desktop spawns for the renderer's Terminal pane
 * (`bridge.terminal.*`). This is RCE-by-design surfaced to the
 * renderer, accepted under the VSCode trust model: the human runs
 * commands as themselves, with their own privileges — deliberately NOT
 * under the agent's `srt` sandbox, and never wired into the agent's
 * tool surface. What keeps the surface safe is that only the desktop's
 * privileged renderer can reach it:
 *
 *  - every IPC channel is registered through `guarded()` in
 *    `ipc-handlers.ts` (sender frame must be editor-origin `/desktop/*`),
 *  - the spawn cwd is a workspace root resolved host-side from the
 *    sidecar registry — the renderer never passes a raw path,
 *  - write/resize/kill verify the calling WebContents owns the
 *    terminal, so one window cannot drive another window's shell.
 *
 * Terminal ids are minted by the preload (UUID) so the renderer's data
 * handler is registered before the PTY emits its first frame — same
 * caller-mints-id pattern as `sessions.enqueue`.
 *
 * See /SECURITY.md `GRIDA-SEC-004`.
 */

import fs from "node:fs";
import path from "node:path";
import type { WebContents } from "electron";
import type { IPty } from "node-pty";
import { IPC_CHANNELS } from "../bridge/contract";

/** Renderer-minted handle: UUID-sized opaque token, nothing fancier. */
const TERMINAL_ID_RE = /^[0-9a-zA-Z-]{1,64}$/;

/** A runaway renderer loop must not fork-bomb the host. The UI spawns
 * one shell per workbench window; 8 leaves headroom for future tabs. */
const MAX_TERMINALS_PER_WEBCONTENTS = 8;

type TerminalRecord = { pty: IPty; wc: WebContents };

const terminals = new Map<string, TerminalRecord>();
/** WebContents ids that already have a kill-on-destroy hook. */
const hookedWebContents = new Set<number>();

// node-pty is a native module, loaded lazily so importing this module
// (e.g. from tests exercising the pure helpers below) never touches
// the addon. The vite main bundle leaves it external; see
// vite.main.config.ts + the packaging recipe in forge.config.ts.
let ptyModule: typeof import("node-pty") | null = null;
async function loadPty(): Promise<typeof import("node-pty")> {
  if (!ptyModule) {
    await ensureSpawnHelperExecutable();
    ptyModule = await import("node-pty");
  }
  return ptyModule;
}

/**
 * node-pty@1.1.0 ships its darwin prebuilt `spawn-helper` without the
 * executable bit — the npm tarball itself carries mode 0644 and nothing
 * in the package ever chmods it — so the first PTY spawn fails with
 * `posix_spawnp failed`. The packaged app fixes the bit at build time
 * (forge.config.ts `packageAfterPrune`), because the installed bundle
 * can be mounted read-only (macOS app translocation). This runtime pass
 * covers the dev tree, and no-ops once the bit is present.
 *
 * The helper is anchored at `app.getAppPath()` (the directory holding
 * package.json in dev; app.asar when packaged) rather than
 * `import.meta.url` — Vite's CJS main build compiles `import.meta` to
 * `{}`, which silently breaks `createRequire`-based resolution.
 * Electron is imported lazily so this module stays importable in plain
 * Node tests.
 */
async function ensureSpawnHelperExecutable(): Promise<void> {
  if (process.platform === "win32") return;
  try {
    const { app } = await import("electron");
    const helper = path
      .join(
        app.getAppPath(),
        "node_modules",
        "node-pty",
        "prebuilds",
        `${process.platform}-${process.arch}`,
        "spawn-helper"
      )
      // Same rewrite node-pty's own loader applies — the helper must
      // run from the real filesystem, not inside the asar.
      .replace("app.asar", "app.asar.unpacked");
    const mode = fs.statSync(helper).mode;
    if (mode & 0o111) return;
    fs.chmodSync(helper, mode | 0o755);
  } catch {
    // No prebuilt helper (source build) or unwritable tree — let the
    // actual spawn surface any real failure.
  }
}

/**
 * The user's default interactive shell. macOS spawns it as a login
 * shell (`-l`) so PATH and profile match Terminal.app; Linux trusts
 * `$SHELL` as-is; Windows defaults to PowerShell (shipped with the OS
 * since Windows 7), matching VSCode's default.
 */
export function resolveDefaultShell(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>
): { command: string; args: string[] } {
  if (platform === "win32") {
    return { command: "powershell.exe", args: [] };
  }
  if (platform === "darwin") {
    return { command: env.SHELL || "/bin/zsh", args: ["-l"] };
  }
  return { command: env.SHELL || "/bin/bash", args: [] };
}

/** Clamp a renderer-supplied grid dimension to something a PTY accepts. */
export function clampGridSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(1000, Math.max(1, Math.floor(value)));
}

export function isValidTerminalId(id: unknown): id is string {
  return typeof id === "string" && TERMINAL_ID_RE.test(id);
}

export async function createTerminal(
  wc: WebContents,
  opts: { id: string; cwd: string; cols: number; rows: number }
): Promise<void> {
  const { id } = opts;
  if (!isValidTerminalId(id)) {
    throw new Error("invalid terminal id");
  }
  if (terminals.has(id)) {
    throw new Error(`terminal already exists: ${id}`);
  }
  let owned = 0;
  for (const record of terminals.values()) {
    if (record.wc === wc) owned += 1;
  }
  if (owned >= MAX_TERMINALS_PER_WEBCONTENTS) {
    throw new Error("too many terminals for this window");
  }

  const pty = await loadPty();
  const shell = resolveDefaultShell(process.platform, process.env);
  const proc = pty.spawn(shell.command, shell.args, {
    name: "xterm-256color",
    cwd: opts.cwd,
    cols: clampGridSize(opts.cols, 80),
    rows: clampGridSize(opts.rows, 24),
    env: {
      ...(process.env as Record<string, string>),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    },
  });

  terminals.set(id, { pty: proc, wc });

  proc.onData((data) => {
    if (!wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.TERMINAL_DATA, { id, data });
    }
  });
  proc.onExit(({ exitCode }) => {
    terminals.delete(id);
    if (!wc.isDestroyed()) {
      wc.send(IPC_CHANNELS.TERMINAL_EXIT, { id, exit_code: exitCode });
    }
  });

  // Kill on window close — no reattach in v1. `destroyed` also fires on
  // app quit, so this covers both; `disposeAllTerminals` below is the
  // belt-and-suspenders for quit paths that skip webContents teardown.
  if (!hookedWebContents.has(wc.id)) {
    hookedWebContents.add(wc.id);
    wc.once("destroyed", () => {
      hookedWebContents.delete(wc.id);
      for (const [id, record] of terminals) {
        if (record.wc === wc) {
          terminals.delete(id);
          record.pty.kill();
        }
      }
    });
  }
}

/** Look up a terminal, enforcing that `wc` is the WebContents that
 * created it — one window cannot drive another window's shell. */
function ownedTerminal(wc: WebContents, id: unknown): TerminalRecord {
  const record = isValidTerminalId(id) ? terminals.get(id) : undefined;
  if (!record || record.wc !== wc) {
    throw new Error("terminal not found");
  }
  return record;
}

export function writeTerminal(wc: WebContents, id: unknown, data: unknown) {
  if (typeof data !== "string") throw new Error("invalid terminal data");
  ownedTerminal(wc, id).pty.write(data);
}

export function resizeTerminal(
  wc: WebContents,
  id: unknown,
  cols: unknown,
  rows: unknown
) {
  ownedTerminal(wc, id).pty.resize(
    clampGridSize(cols, 80),
    clampGridSize(rows, 24)
  );
}

/**
 * Idempotent on a missing id: the renderer's unmount cleanup races the
 * host's own exit cleanup (a shell `exit` deletes the record before the
 * pane unmounts), so "already gone" is a normal outcome — not an error.
 * A live terminal still requires ownership, like write/resize.
 */
export function killTerminal(wc: WebContents, id: unknown) {
  if (!isValidTerminalId(id)) return;
  const record = terminals.get(id);
  if (!record) return;
  if (record.wc !== wc) throw new Error("terminal not found");
  terminals.delete(id);
  record.pty.kill();
}

export function disposeAllTerminals() {
  for (const record of terminals.values()) {
    record.pty.kill();
  }
  terminals.clear();
}
