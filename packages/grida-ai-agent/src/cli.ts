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
 *   serve                                        start the HTTP server; print PORT
 *   run [--session <id>] "message"               one turn; echoes the session id
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
 * This module is import-safe: it never runs `main()` on import. The executable
 * shim is `cli.bin.ts`, so tests can import the command handlers directly.
 */
import crypto from "node:crypto";
import { home } from "@grida/home";
import { AgentTransport } from "./transport";
import type { AgentHost } from "./agent-host";
import type { AgentUIMessageChunk } from "./protocol/wire";
import type { ChatMessageWithParts, ChatSessionRow } from "./session/rows";

const CLIENT_ORIGIN = "http://127.0.0.1";
const CLIENT_REFERER_PATH = "/cli";
const REFERER = `${CLIENT_ORIGIN}${CLIENT_REFERER_PATH}`;

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
      await serveCommand();
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

async function serveCommand(): Promise<void> {
  const config = readConfig();
  const host = await createHost(config);
  await host.start();
  process.stdout.write(`PORT=${host.port}\n`);
  process.stderr.write(
    `grida-agent listening on ${AgentTransport.baseUrl(host.port)}\n`
  );
  process.stderr.write(`PASSWORD=${config.password}\n`);
  await waitForShutdown(host);
}

/**
 * Spin a throwaway `AgentHost`, hand a connected client to `fn`, then stop the
 * host. Every non-`serve` command runs through here so the host lifecycle is
 * owned in exactly one place.
 */
async function withClient(
  fn: (client: AgentTransport.Client) => Promise<void>
): Promise<void> {
  const config = readConfig();
  const host = await createHost(config);
  await host.start();
  try {
    await fn(createClient(host.port, config.password));
  } finally {
    await host.stop();
  }
}

export async function runCommand(
  client: AgentTransport.Client,
  args: string[],
  out: CliWriter
): Promise<void> {
  const { session_id: sessionId, message } = parseRunArgs(args);
  if (!message) {
    throw new Error('usage: grida-agent run [--session <id>] "message"');
  }
  const handle = await client.agent.run(
    { messages: [{ role: "user", content: message }], session_id: sessionId },
    (chunk) => writeTextDelta(chunk, out)
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

/** Pull `--session <id>` / `-s <id>` out of `run`'s args; the remainder is the
 *  message text. Exported for unit testing. */
export function parseRunArgs(args: string[]): {
  session_id?: string;
  message: string;
} {
  let sessionId: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--session" || args[i] === "-s") {
      sessionId = args[i + 1];
      i += 1;
    } else {
      rest.push(args[i]);
    }
  }
  return { session_id: sessionId, message: rest.join(" ").trim() };
}

async function createHost(config: CliConfig): Promise<AgentHost> {
  const { AgentHost } = await import("./server");
  return new AgentHost({
    password: config.password,
    user_data_path: config.user_data_path,
    http_access: {
      allowed_origins: [CLIENT_ORIGIN],
      allowed_referer_paths: [CLIENT_REFERER_PATH],
    },
  });
}

function createClient(port: number, password: string): AgentTransport.Client {
  return new AgentTransport.Client({
    base_url: AgentTransport.baseUrl(port),
    password,
    origin: CLIENT_ORIGIN,
    referer: REFERER,
  });
}

function readConfig(): CliConfig {
  const password =
    process.env.GRIDA_AGENT_PASSWORD ??
    crypto.randomBytes(32).toString("base64url");
  const userDataPath = process.env.GRIDA_AGENT_USER_DATA ?? home.join("agent");
  return { password, user_data_path: userDataPath };
}

async function waitForShutdown(host: AgentHost): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = (signal: NodeJS.Signals) => {
      process.stderr.write(`grida-agent shutdown (${signal})\n`);
      void host.stop().finally(resolve);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
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
  grida-agent serve
  grida-agent run [--session <id>] "message"
  grida-agent sessions
  grida-agent messages <sessionId>
  grida-agent compact <sessionId>
  grida-agent rewind <sessionId> <messageId> [--restore]
  grida-agent fork <sessionId> <messageId>
`);
}
