/**
 * Claude provider — Grida as ACP consumer driving the ACP-team bridge
 * `@agentclientprotocol/claude-agent-acp` over stdio (it wraps the official
 * Claude Agent SDK). Streams token deltas natively.
 *
 * Auth: the bridge runs on the user's logged-in Claude → the Pro/Max
 * SUBSCRIPTION when `ANTHROPIC_API_KEY` is unset (we strip it from the child
 * env). Continuity: turn 1 mints an ACP session (`session/new`); later turns
 * resume it (`session/resume`, gated by the bridge's `session.resume`
 * capability) so the agent keeps the conversation and Grida sends only the new
 * user message.
 */
import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type Client,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type Stream,
} from "@agentclientprotocol/sdk";
import type {
  AgentProviderSession,
  ChunkSink,
  OpenProviderOptions,
  ProviderChunk,
  TurnResult,
} from "./types";

const BRIDGE_PKG = "@agentclientprotocol/claude-agent-acp";

/**
 * SDK options injected into the bridge via ACP `_meta.claudeCode.options` (the
 * bridge merges these into its `query()` Options). Opus 4.7+ defaults
 * `thinking.display` to `"omitted"`, so thinking blocks stream EMPTY; opting
 * back in to `"summarized"` here restores visible reasoning. Verified to work
 * on the default model via the SDK-options path (the CLI `--thinking-display`
 * flag is buggy on 4.7 — anthropics/claude-code#56356 — but this path isn't).
 */
/**
 * Build the ACP `_meta` that carries SDK options into the bridge: always opt
 * back in to summarized thinking; pass `model` when the picker chose one
 * (issue #813 model picker — verified the `_meta` model override switches the
 * model, incl. the `claude-opus-4-8[1m]` 1M variant).
 */
function sessionMeta(model?: string) {
  return {
    claudeCode: {
      options: {
        thinking: { type: "adaptive", display: "summarized" },
        ...(model ? { model } : {}),
      },
    },
  };
}

/**
 * `claude-agent-acp` may interleave non-JSON-RPC diagnostics on stdout; keep
 * only valid `jsonrpc:"2.0"` lines so `ndJsonStream`'s one-JSON-per-line
 * contract holds (a multi-line/log line would otherwise crash the parser).
 */
function jsonrpcLineFilter(stdout: Readable): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let buf = "";
  return new ReadableStream<Uint8Array>({
    start(controller) {
      stdout.on("data", (b: Buffer) => {
        buf += b.toString();
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as { jsonrpc?: unknown };
            if (obj && typeof obj === "object" && obj.jsonrpc === "2.0") {
              controller.enqueue(encoder.encode(line + "\n"));
            }
          } catch {
            /* diagnostic line — drop */
          }
        }
      });
      stdout.on("end", () => controller.close());
      stdout.on("error", (e) => controller.error(e));
    },
  });
}

/** ACP `session/update` → normalized `ProviderChunk` (text-path subset). */
function translate(
  update: SessionNotification["update"]
): ProviderChunk | null {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return update.content.type === "text"
        ? { type: "text", text: update.content.text }
        : null;
    case "agent_thought_chunk":
      return update.content.type === "text"
        ? { type: "reasoning", text: update.content.text }
        : null;
    case "tool_call":
      return {
        type: "tool",
        id: String(update.toolCallId),
        name: String(update.title ?? update.kind ?? "tool"),
        status: "pending",
      };
    case "tool_call_update": {
      const s = update.status;
      return {
        type: "tool",
        id: String(update.toolCallId),
        name: String(update.title ?? "tool"),
        status:
          s === "completed"
            ? "completed"
            : s === "failed"
              ? "failed"
              : "running",
      };
    }
    default:
      return null; // plan / commands / mode / usage updates: ignored in the PoC
  }
}

/**
 * The ACP transport to the bridge: a `Stream` plus teardown + recent stderr
 * for error context. The default {@link spawnBridge} spawns the npx bridge over
 * stdio; tests inject an in-memory transport wired to a fake ACP agent (see
 * `testing/fake-acp-agent`) — that injection is what lets the JTBD suite drive
 * the consumer deterministically, with no real Claude and no `npx`.
 */
export type BridgeTransport = {
  stream: Stream;
  /** Recent bridge stderr, surfaced in prompt errors (empty for in-memory). */
  errorTail: () => string;
  close: () => void;
};

/** How {@link openClaudeSession} obtains its transport. Swap it in tests. */
export type BridgeConnect = (ctx: { cwd: string }) => BridgeTransport;

/**
 * Default transport: spawn `npx @agentclientprotocol/claude-agent-acp` and
 * speak ACP over its stdio. `ANTHROPIC_API_KEY` is stripped so the bridge runs
 * on the user's logged-in subscription, not an API key.
 */
const spawnBridge: BridgeConnect = ({ cwd }) => {
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY; // subscription billing only

  const child = spawn("npx", ["-y", BRIDGE_PKG], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
  const stderr: string[] = [];
  child.stderr!.on("data", (b: Buffer) => stderr.push(b.toString()));

  const stream = ndJsonStream(
    Writable.toWeb(child.stdin!) as WritableStream<Uint8Array>,
    jsonrpcLineFilter(child.stdout!)
  );
  return {
    stream,
    errorTail: () => stderr.slice(-6).join(""),
    close: () => {
      try {
        child.stdin!.end();
      } catch {
        /* already closed */
      }
      child.kill("SIGTERM");
    },
  };
};

export async function openClaudeSession(
  opts: OpenProviderOptions = {},
  deps: { connect?: BridgeConnect } = {}
): Promise<AgentProviderSession> {
  const cwd = opts.cwd ?? process.cwd();
  const transport = (deps.connect ?? spawnBridge)({ cwd });

  let sink: ChunkSink | undefined;
  const handlers: Client = {
    async sessionUpdate(params: SessionNotification): Promise<void> {
      const chunk = translate(params.update);
      if (chunk && sink) sink(chunk);
    },
    // PoC: auto-approve any tool the agent wants. A real client routes this to
    // the host's permission UX (acp.md §permission-ux).
    async requestPermission(
      req: RequestPermissionRequest
    ): Promise<RequestPermissionResponse> {
      const allow =
        req.options.find((o) => o.kind === "allow_always") ??
        req.options.find((o) => o.kind === "allow_once") ??
        req.options[0];
      if (!allow) return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: allow.optionId } };
    },
  };

  const conn = new ClientSideConnection(
    (_agent: Agent) => handlers,
    transport.stream
  );

  const init = await conn.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {},
    clientInfo: { name: "grida-agent-provider", version: "0.0.0" },
  });
  const canResume = init.agentCapabilities?.sessionCapabilities?.resume != null;

  let sessionId: string;
  let resumed = false;
  const meta = sessionMeta(opts.model);
  const startFresh = async () =>
    (await conn.newSession({ cwd, mcpServers: [], _meta: meta })).sessionId;

  if (opts.resumeSessionId && canResume) {
    try {
      await conn.resumeSession({
        sessionId: opts.resumeSessionId,
        cwd,
        mcpServers: [],
        _meta: meta,
      });
      sessionId = opts.resumeSessionId;
      resumed = true;
    } catch {
      // Stale/unknown id — the bridge restarted, the session expired, or the
      // id never existed. Continuity is best-effort: start a fresh session
      // rather than failing the turn. The new id is persisted for next time.
      sessionId = await startFresh();
    }
  } else {
    sessionId = await startFresh();
  }

  return {
    id: "claude",
    info: {
      transport: "acp",
      bridge: `npx ${BRIDGE_PKG}`,
      protocolVersion: init.protocolVersion,
      model: opts.model ?? "(subscription default)",
      sessionId,
      resumed,
    },
    async prompt(text, onChunk): Promise<TurnResult> {
      sink = onChunk;
      try {
        const res = await conn.prompt({
          sessionId,
          prompt: [{ type: "text", text }],
        });
        return { stopReason: res.stopReason, providerSessionId: sessionId };
      } catch (err) {
        const tail = transport.errorTail();
        throw new Error(
          `${BRIDGE_PKG} prompt failed: ${String(err)}${tail ? `\n--- bridge stderr ---\n${tail}` : ""}`
        );
      } finally {
        sink = undefined;
      }
    },
    async cancel(): Promise<void> {
      // ACP `session/cancel` — the bridge stops the SDK turn; `prompt` then
      // resolves with a cancelled stop reason. Swallow errors (a cancel on an
      // already-finished/torn-down turn must not throw over the abort path).
      try {
        await conn.cancel({ sessionId });
      } catch {
        /* nothing in flight, or the connection is already closing */
      }
    },
    async dispose(): Promise<void> {
      transport.close();
    },
  };
}
