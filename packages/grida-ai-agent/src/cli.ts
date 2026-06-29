/**
 * grida-agent CLI — the canonical, host-agnostic entrypoint to the agent
 * system.
 *
 * Source-of-truth rule: every agent feature lands HERE first. Desktop and any
 * other host are thin wrappers over the same `AgentHost` + `AgentTransport`
 * this CLI drives — if a capability exists in the UI but not here, that's the
 * bug. Keeping the CLI complete is also what makes the core testable without
 * an Electron shell (see `cli.test.ts`).
 *
 * Commands:
 *   serve [--register] [--allow-origin <o>]      start the HTTP server; print PORT
 *   start                                        connect-or-spawn the daemon; print URL
 *   status                                       probe the registered daemon
 *   stop                                         stop the registered daemon
 *   run [--session <id>] [--workspace <path>]    one turn; echoes the session id
 *       [--mode <auto|accept-edits>] [--model <id>] "message"
 *   sessions                                     list sessions
 *   messages <sessionId>                         print the linear transcript
 *   compact <sessionId>                          fire compaction; print the result
 *   rewind  <sessionId> <messageId> [--restore]  soft-truncate (or un-rewind)
 *   fork    <sessionId> <messageId>              fork a new session at a message
 *
 * The lifecycle commands (compact / rewind / fork) are thin wrappers over
 * `AgentTransport.Client.sessions.*` — the very methods the desktop bridge
 * calls. Behavior is owned by the runtime; this layer only parses args,
 * invokes the client, and prints the result.
 *
 * Daemon model (WG spec docs/wg/ai/agent/daemon.md, issue #798):
 * `serve --register` publishes a discovery record + persistent credential so
 * any local-process client can attach. Client commands reuse a registered,
 * healthy daemon (shared sessions) and only fall back to a throwaway embedded
 * host when none is running.
 *
 * This module is import-safe: it never runs `main()` on import. The executable
 * shim is `cli.bin.ts`, so tests can import the command handlers directly.
 */
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { home } from "@grida/home";
import { Daemon } from "./daemon";
import { AgentTransport } from "./transport";
import type { AgentHost } from "./agent-host";
import type { AgentMode } from "./protocol/mode";
import type { AgentUIMessageChunk } from "./protocol/wire";
import type { ChatMessageWithParts, ChatSessionRow } from "./session/rows";

const CLIENT_ORIGIN = Daemon.LOCAL_CLIENT_ORIGIN;
const CLIENT_REFERER_PATH = Daemon.LOCAL_CLIENT_REFERER_PATH;
const REFERER = `${CLIENT_ORIGIN}${CLIENT_REFERER_PATH}`;

/**
 * Informational only — compatibility is gated on the wire protocol the
 * handshake reports (`AGENT_SERVER_PROTOCOL`), never on this string.
 * Matches the (private) package version.
 */
const CLI_VERSION = "0.0.0";

/** Minimal output sink the command handlers write to: `process.stdout` in
 *  `main`, an array-backed fake in tests. */
export type CliWriter = { write(text: string): void };

type CliConfig = {
  password: string;
  user_data_path: string;
};

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const out: CliWriter = { write: (s) => void process.stdout.write(s) };
  switch (command) {
    case "serve":
      await serveCommand(argv.slice(1));
      return;
    case "start":
      await startCommand(out, readConfig().user_data_path);
      return;
    case "status":
      await statusCommand(out, readConfig().user_data_path);
      return;
    case "stop":
      await stopCommand(out, readConfig().user_data_path);
      return;
    case "acp":
      await acpCommand();
      return;
    case "run":
      await withClient((c) => runCommand(c, argv.slice(1), out));
      return;
    case "sessions":
      await withClient((c) => sessionsCommand(c, out));
      return;
    case "messages":
      await withClient((c) => messagesCommand(c, argv.slice(1), out));
      return;
    case "compact":
      await withClient((c) => compactCommand(c, argv.slice(1), out));
      return;
    case "rewind":
      await withClient((c) => rewindCommand(c, argv.slice(1), out));
      return;
    case "fork":
      await withClient((c) => forkCommand(c, argv.slice(1), out));
      return;
    case "--help":
    case "-h":
    case undefined:
      printHelp(out);
      return;
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

export type ServeFlags = {
  register: boolean;
  allow_origins: string[];
  allow_referer_paths: string[];
};

/** Parse `serve`'s options. Exported for unit testing. */
export function parseServeArgs(args: string[]): ServeFlags {
  const flags: ServeFlags = {
    register: false,
    allow_origins: [],
    allow_referer_paths: [],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--register") {
      flags.register = true;
    } else if (arg === "--allow-origin" || arg === "--allow-referer-path") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === "--allow-origin") flags.allow_origins.push(value);
      else flags.allow_referer_paths.push(value);
      i += 1;
    } else {
      throw new Error(`unknown serve option: ${arg}`);
    }
  }
  return flags;
}

async function serveCommand(args: string[]): Promise<void> {
  const flags = parseServeArgs(args);
  const config = readConfig();
  if (flags.register) {
    // Daemon model: a REGISTERED server must outlive any one client, so the
    // per-launch password gives way to the persistent on-disk credential
    // every local-process client can read (WG spec §auth-model).
    config.password = await Daemon.readOrCreateCredential(
      config.user_data_path
    );
  }
  // A `serve` daemon is the host the desktop-from-web bridge drives — a human
  // is present, so the `question` tool pauses for their answer (interactive).
  const host = await createHost(config, flags, true);
  await host.start();
  process.stdout.write(`PORT=${host.port}\n`);
  process.stderr.write(
    `grida-agent listening on ${AgentTransport.baseUrl(host.port)}\n`
  );
  process.stderr.write(`PASSWORD=${config.password}\n`);
  let registration: Daemon.Registration | null = null;
  if (flags.register) {
    registration = Daemon.mintRegistration({
      version: CLI_VERSION,
      url: AgentTransport.baseUrl(host.port),
      pid: process.pid,
    });
    await Daemon.publish(config.user_data_path, registration);
    process.stderr.write(
      `REGISTERED ${Daemon.paths(config.user_data_path).registration}\n`
    );
  }
  await waitForShutdown(
    host,
    registration
      ? { state_dir: config.user_data_path, registration }
      : undefined
  );
}

/**
 * Connect-or-spawn the daemon (WG spec §connect-or-spawn): reuse a healthy
 * registered daemon, or spawn `serve --register` detached and wait for it
 * to publish. Prints the connection facts.
 */
export async function startCommand(
  out: CliWriter,
  stateDir: string,
  spawnDaemon: () => void = spawnDetachedDaemon
): Promise<void> {
  const connection = await Daemon.connectOrSpawn(stateDir, {
    spawn: spawnDaemon,
  });
  out.write(`URL=${connection.url}\n`);
  out.write(`PID=${connection.registration.pid}\n`);
}

/** Probe the registered daemon and print one status line. */
export async function statusCommand(
  out: CliWriter,
  stateDir: string
): Promise<void> {
  const registration = await Daemon.read(stateDir);
  if (!registration) {
    out.write("no daemon registered\n");
    return;
  }
  const credential = await Daemon.readCredential(stateDir);
  const result = credential
    ? await Daemon.probe(registration, credential)
    : ({ ok: false, reason: "unauthorized" } as const);
  if (result.ok) {
    out.write(
      `daemon ${registration.url} pid=${registration.pid} ` +
        `protocol=${result.handshake.protocol} healthy\n`
    );
  } else {
    out.write(
      `daemon ${registration.url} pid=${registration.pid} ` +
        `unreachable (${result.reason})\n`
    );
  }
}

/**
 * Stop the registered daemon. The recorded pid is signaled only after an
 * authenticated probe proved the record describes a live daemon holding our
 * credential (WG spec §stale-records); a stale record is just removed.
 */
export async function stopCommand(
  out: CliWriter,
  stateDir: string
): Promise<void> {
  const registration = await Daemon.read(stateDir);
  if (!registration) {
    out.write("no daemon registered\n");
    return;
  }
  const credential = await Daemon.readCredential(stateDir);
  const probed = credential
    ? await Daemon.probe(registration, credential)
    : null;
  if (probed?.ok) {
    try {
      process.kill(registration.pid, "SIGTERM");
    } catch {
      // already gone
    }
    await waitForPidExit(registration.pid);
    out.write(`stopped pid=${registration.pid}\n`);
  } else {
    out.write(
      `registration stale (${probed ? probed.reason : "no credential"}) — removing\n`
    );
  }
  // The daemon unpublishes itself on SIGTERM; this covers the stale path
  // and the race where it died before its own cleanup. Owned-only delete.
  await Daemon.unpublish(stateDir, registration.id);
}

/**
 * Run as an ACP agent over stdio (docs/wg/ai/agent/acp.md): the editor
 * launches `grida-agent acp` and drives it via JSON-RPC. The core is
 * reached like any other client — a registered daemon when healthy,
 * otherwise an in-process host that lives for this stdio connection.
 * Either way the same session store backs the conversation.
 */
async function acpCommand(): Promise<void> {
  const { runAcpStdio } = await import("./acp");
  const { client, host } = await resolveClient();
  try {
    await runAcpStdio({ client, version: CLI_VERSION }).closed;
  } finally {
    await host?.stop();
  }
}

/**
 * Resolve a client against the best available host: a registered, healthy
 * daemon when one exists (shared sessions — issue #798), else a throwaway
 * embedded `AgentHost`. When `host` is non-null the caller owns its
 * lifecycle and must `stop()` it.
 */
async function resolveClient(): Promise<{
  client: AgentTransport.Client;
  host: AgentHost | null;
}> {
  const config = readConfig();
  const daemon = await Daemon.connect(config.user_data_path);
  if (daemon) {
    return { client: createClient(daemon.url, daemon.credential), host: null };
  }
  const host = await createHost(config);
  await host.start();
  return {
    client: createClient(AgentTransport.baseUrl(host.port), config.password),
    host,
  };
}

async function withClient(
  fn: (client: AgentTransport.Client) => Promise<void>
): Promise<void> {
  const { client, host } = await resolveClient();
  try {
    await fn(client);
  } finally {
    await host?.stop();
  }
}

export async function runCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const {
    session_id: sessionId,
    workspace,
    mode,
    model_id: modelId,
    message,
  } = parseRunArgs(args);
  if (!message) {
    throw new Error(
      'usage: grida-agent run [--session <id>] [--workspace <path>] [--mode <auto|accept-edits>] [--model <id>] "message"'
    );
  }
  // Bind a workspace when asked: open it (idempotent) and pass its id, so this
  // run gets the server-side fs / command / scratch / image-gen bindings — the
  // only way to exercise any workspace tool from the CLI. Without it the run is
  // the bare client-resolved mode (no server tools). The workspace shell tools
  // need scratch, which the runtime derives only for a workspace-bound run.
  const workspaceId = workspace
    ? (await client.workspaces.open(workspace)).id
    : undefined;
  const handle = await client.agent.run(
    {
      messages: [{ role: "user", content: message }],
      session_id: sessionId,
      workspace_id: workspaceId,
      // A headless one-shot `run` has no UI to answer a supervised approval, so
      // a workspace-bound run defaults to `auto` (every command runs) — matching
      // the CLI's unsandboxed-shell stance that the operator IS the user.
      // `--mode accept-edits` is honored for callers that drive approvals.
      mode: workspaceId ? (mode ?? "auto") : mode,
      ...(modelId ? { model_id: modelId } : {}),
      // A one-shot `run` has no UI to answer the `question` tool — and it may
      // target a daemon that IS interactive for a web client. Declare headless
      // per-run so `question` returns its fixed refusal instead of pausing this
      // run forever (and leaving the session stuck on `human-input-pending`).
      interactive: false,
    },
    (chunk) => {
      writeTextDelta(chunk, out);
      // Surface tool activity on stderr so a CLI run is self-evidencing (which
      // tool fired) without polluting the stdout transcript.
      writeToolTrace(chunk);
    }
  );
  await handle.done;
  out.write("\n");
  // Echo the (possibly newly-created) session id so the next `run --session`
  // or `compact` can target this conversation.
  out.write(`SESSION=${handle.session_id}\n`);
}

export async function sessionsCommand(
  client: AgentTransport.Client,
  out: CliWriter
): Promise<void> {
  const sessions = await client.sessions.list({ limit: 50 });
  printSessions(sessions.items, out);
}

/**
 * Print the linear transcript — the source of truth. The full conversation in
 * creation order; a compaction shows as an inline `── compacted ──` divider at
 * the point it was fired (the bottom), with the summarized history still above
 * it. Rewound turns are tagged, not dropped.
 */
export async function messagesCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const sessionId = args[0];
  if (!sessionId) throw new Error("usage: grida-agent messages <sessionId>");
  const messages = await client.sessions.list_messages(sessionId);
  printMessages(messages, out);
}

export async function compactCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const sessionId = args[0];
  if (!sessionId) throw new Error("usage: grida-agent compact <sessionId>");
  const result = await client.sessions.compact(sessionId);
  out.write(`${JSON.stringify(result)}\n`);
}

export async function rewindCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const [sessionId, messageId] = args.filter((a) => !a.startsWith("-"));
  if (!sessionId || !messageId) {
    throw new Error(
      "usage: grida-agent rewind <sessionId> <messageId> [--restore]"
    );
  }
  const restore = args.includes("--restore");
  const result = await client.sessions.rewind(sessionId, messageId, {
    restore,
  });
  out.write(`${JSON.stringify(result)}\n`);
}

export async function forkCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const [sessionId, messageId] = args;
  if (!sessionId || !messageId) {
    throw new Error("usage: grida-agent fork <sessionId> <messageId>");
  }
  const row = await client.sessions.fork(sessionId, messageId);
  out.write(`${row.id}\t${row.title}\n`);
}

/** Pull the value-flags (`--session`/`-s`, `--workspace`/`-w`, `--mode`,
 *  `--model`) out of `run`'s args; the remainder joins as the message text.
 *  Exported for unit testing. */
export function parseRunArgs(args: string[]): {
  session_id?: string;
  workspace?: string;
  mode?: AgentMode;
  model_id?: string;
  message: string;
} {
  let sessionId: string | undefined;
  let workspace: string | undefined;
  let mode: AgentMode | undefined;
  let modelId: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--session" || arg === "-s") {
      sessionId = args[++i];
    } else if (arg === "--workspace" || arg === "-w") {
      workspace = args[++i];
    } else if (arg === "--mode") {
      const value = args[++i];
      if (value !== "auto" && value !== "accept-edits") {
        throw new Error(
          `--mode must be "auto" or "accept-edits", got ${value}`
        );
      }
      mode = value;
    } else if (arg === "--model") {
      modelId = args[++i];
    } else {
      rest.push(arg);
    }
  }
  return {
    session_id: sessionId,
    workspace,
    mode,
    model_id: modelId,
    message: rest.join(" ").trim(),
  };
}

async function createHost(
  config: CliConfig,
  flags?: Pick<ServeFlags, "allow_origins" | "allow_referer_paths">,
  // Whether this host serves a human UI (RFC `tools` §question). A long-lived
  // `serve` daemon is driven by a human client (the desktop-from-web bridge),
  // so the locked `question` tool pauses for their answer. The throwaway
  // embedded host behind a one-shot `run` has no client UI → stays headless and
  // the tool returns the fixed refusal.
  interactive = false
): Promise<AgentHost> {
  const { AgentHost } = await import("./server");
  return new AgentHost({
    password: config.password,
    user_data_path: config.user_data_path,
    http_access: {
      // The canonical local-client origin is always admitted; additional
      // origins (e.g. a dev web client) are an explicit serve-time opt-in.
      allowed_origins: [CLIENT_ORIGIN, ...(flags?.allow_origins ?? [])],
      allowed_referer_paths: [
        CLIENT_REFERER_PATH,
        ...(flags?.allow_referer_paths ?? []),
      ],
    },
    // GRIDA-SEC-004 — the CLI runs WITHOUT an OS sandbox. It's a local,
    // user-invoked dev/power tool (the operator is the user running it), so it
    // deliberately opts into the shell rather than fail-closed. The desktop
    // host, by contrast, only enables shell when srt actually wraps it.
    allow_unsandboxed_shell: true,
    // The locked `question` tool pauses for a human only when this host serves
    // a UI (the `serve` daemon driven by the desktop-from-web bridge). A
    // throwaway embedded host (one-shot `run`) is headless → fixed refusal.
    interactive,
  });
}

function createClient(
  baseUrl: string,
  password: string
): AgentTransport.Client {
  return new AgentTransport.Client({
    base_url: baseUrl,
    password,
    origin: CLIENT_ORIGIN,
    referer: REFERER,
  });
}

/**
 * Re-invoke this same CLI entry as a detached daemon
 * (`node [execArgv] <entry> serve --register`). `execArgv` carries dev
 * loader flags (`--import tsx`) so the spawn works both from the built bin
 * and the dev `pnpm cli` path. The child outlives this process.
 */
function spawnDetachedDaemon(): void {
  const entry = process.argv[1];
  if (!entry) {
    throw new Error("[grida-agent] cannot resolve CLI entrypoint for spawn");
  }
  spawn(process.execPath, [...process.execArgv, entry, "serve", "--register"], {
    detached: true,
    stdio: "ignore",
  }).unref();
}

/** Poll `kill(pid, 0)` until the process is gone, attempt-bounded. */
async function waitForPidExit(pid: number): Promise<void> {
  for (let i = 0; i < 100; i += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return; // ESRCH — gone
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function readConfig(): CliConfig {
  const password =
    process.env.GRIDA_AGENT_PASSWORD ??
    crypto.randomBytes(32).toString("base64url");
  const userDataPath = process.env.GRIDA_AGENT_USER_DATA ?? home.join("agent");
  return { password, user_data_path: userDataPath };
}

async function waitForShutdown(
  host: AgentHost,
  daemon?: { state_dir: string; registration: Daemon.Registration }
): Promise<void> {
  await new Promise<void>((resolve) => {
    let tick: NodeJS.Timeout | null = null;
    let settled = false;
    const finish = (label: string, unpublish: boolean) => {
      if (settled) return;
      settled = true;
      if (tick) clearInterval(tick);
      process.stderr.write(`grida-agent shutdown (${label})\n`);
      const cleanup =
        daemon && unpublish
          ? Daemon.unpublish(daemon.state_dir, daemon.registration.id).catch(
              () => false
            )
          : Promise.resolve(false);
      void cleanup.then(() => void host.stop().finally(resolve));
    };
    const stop = (signal: NodeJS.Signals) => finish(signal, true);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    if (daemon) {
      // Ownership re-assertion (WG spec §convergence): last writer wins —
      // when the registration is no longer ours (a newer daemon published,
      // or an operator removed the record), stand down instead of fighting.
      tick = setInterval(() => {
        void Daemon.checkOwnership(
          daemon.state_dir,
          daemon.registration.id
        ).then((status) => {
          if (status !== "owned") finish(`registration ${status}`, false);
        });
      }, Daemon.OWNERSHIP_INTERVAL_MS);
      tick.unref();
    }
  });
}

function writeTextDelta(chunk: AgentUIMessageChunk, out: CliWriter): void {
  const data = chunk as {
    type?: string;
    delta?: unknown;
    text_delta?: unknown;
  };
  if (data.type !== "text-delta") return;
  const text =
    typeof data.delta === "string"
      ? data.delta
      : typeof data.text_delta === "string"
        ? data.text_delta
        : "";
  if (text) out.write(text);
}

/**
 * Echo tool activity to STDERR (not the stdout transcript) so a `run` is
 * self-evidencing — you can see `generate_image` / `run_command` fire. The
 * UI-message stream names a tool on its `tool-input-available` chunk.
 */
function writeToolTrace(chunk: AgentUIMessageChunk): void {
  const data = chunk as { type?: string; toolName?: unknown };
  if (
    data.type === "tool-input-available" &&
    typeof data.toolName === "string"
  ) {
    process.stderr.write(`  [tool] ${data.toolName}\n`);
  }
}

function printSessions(items: ChatSessionRow[], out: CliWriter): void {
  if (items.length === 0) {
    out.write("No sessions\n");
    return;
  }
  for (const row of items) {
    out.write(
      `${row.id}\t${new Date(row.updated_at).toISOString()}\t${row.title}\n`
    );
  }
}

function printMessages(messages: ChatMessageWithParts[], out: CliWriter): void {
  if (messages.length === 0) {
    out.write("No messages\n");
    return;
  }
  for (const m of messages) {
    if (m.parts.some((p) => p.type === "data-compaction")) {
      out.write("──────── compacted ────────\n");
      continue;
    }
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p.data as { text?: string }).text ?? "")
      .join("");
    const tools = m.parts
      .filter((p) => p.type.startsWith("tool-") || p.type === "dynamic-tool")
      .map((p) => (p.data as { tool_name?: string }).tool_name ?? p.type);
    const body = [text, tools.length ? `[tools: ${tools.join(", ")}]` : ""]
      .filter(Boolean)
      .join(" ");
    const tag = m.hidden_at != null ? " (rewound)" : "";
    out.write(`[${m.role}${tag}] ${body}\n`);
  }
}

function printHelp(out: CliWriter): void {
  out.write(`grida-agent

Usage:
  grida-agent serve [--register] [--allow-origin <origin>] [--allow-referer-path <path>]
  grida-agent start
  grida-agent status
  grida-agent stop
  grida-agent acp
  grida-agent run [--session <id>] [--workspace <path>] [--mode <auto|accept-edits>] [--model <id>] "message"
  grida-agent sessions
  grida-agent messages <sessionId>
  grida-agent compact <sessionId>
  grida-agent rewind <sessionId> <messageId> [--restore]
  grida-agent fork <sessionId> <messageId>
`);
}
