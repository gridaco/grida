/**
 * ACP adapter — Grida as an ACP **agent** (WG spec docs/wg/ai/agent/acp.md;
 * daemon roadmap phase 4, issue #798).
 *
 * One translator, no state of its own: every `session/update` it emits is
 * sourced from one AI-SDK chunk (or one stored message during
 * `session/load`) that the core already produced. The core is reached over
 * the SAME HTTP contract every other client rides (`AgentTransport.Client`
 * against a registered daemon or an in-process `AgentHost`) — ACP is an
 * outward wire, never a second implementation.
 *
 * Direction note: this is the *agent* side (an ACP client like Zed drives
 * Grida). The consuming direction (Grida drives Codex/Claude over ACP,
 * docs/wg/ai/agent/acp-provider-codex.md) is a different seam.
 *
 * Naming seam (acp.md §naming-seam): ACP wire is camelCase
 * (`sessionId`, `toolCallId`); the core is snake_case. The rename happens
 * HERE and only here.
 */
import {
  PROTOCOL_VERSION,
  type Agent,
  type CancelNotification,
  type ContentBlock,
  type InitializeRequest,
  type InitializeResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type SessionNotification,
  type StopReason,
  type ToolKind,
} from "@agentclientprotocol/sdk";
import { AGENT_SESSION_AGENT } from "../protocol/run";
import type { AgentUIMessageChunk } from "../protocol/wire";
import type { AgentTransport } from "../transport";

/**
 * The slice of the transport the adapter actually drives. Structural so
 * tests can hand in a scripted fake; `AgentTransport.Client` satisfies it.
 */
export type AcpCoreClient = {
  sessions: {
    create: AgentTransport.Client["sessions"]["create"];
    list_messages: AgentTransport.Client["sessions"]["list_messages"];
  };
  agent: {
    run: AgentTransport.Client["agent"]["run"];
    abort: AgentTransport.Client["agent"]["abort"];
  };
};

/**
 * Where translated updates land. `AgentSideConnection` satisfies this;
 * tests record into an array.
 */
export type AcpUpdateSink = {
  sessionUpdate(params: SessionNotification): Promise<void>;
};

export type AcpAgentAdapterOptions = {
  client: AcpCoreClient;
  /** Session agent tag for sessions minted over ACP. */
  agent?: string;
  /** `agentInfo.version` advertised at initialize. */
  version?: string;
};

/** acp.md §tool-kind-mapping — locked tool → ACP `kind`. */
const TOOL_KIND: Record<string, ToolKind> = {
  read_file: "read",
  write_file: "edit",
  edit_file: "edit",
  list_files: "search",
  grep_files: "search",
  run_command: "execute",
  todo_write: "other",
  skill: "think",
};

export function toolKind(toolName: string): ToolKind {
  return TOOL_KIND[toolName] ?? "other";
}

/**
 * Translate one AI-SDK chunk to one ACP `SessionUpdate` (acp.md §update
 * mapping). `null` = no outward counterpart (start/finish bookkeeping,
 * in-band frames a client must not see). Pure; exported for tests.
 */
export function translateChunk(
  chunk: AgentUIMessageChunk
): SessionNotification["update"] | null {
  const c = chunk as Record<string, unknown> & { type?: string };
  switch (c.type) {
    case "text-delta": {
      const text = typeof c.delta === "string" ? c.delta : "";
      if (!text) return null;
      return {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      };
    }
    case "reasoning-delta": {
      const text = typeof c.delta === "string" ? c.delta : "";
      if (!text) return null;
      return {
        sessionUpdate: "agent_thought_chunk",
        content: { type: "text", text },
      };
    }
    case "tool-input-start": {
      const toolName = String(c.toolName ?? "tool");
      return {
        sessionUpdate: "tool_call",
        toolCallId: String(c.toolCallId),
        title: toolName,
        kind: toolKind(toolName),
        status: "pending",
      };
    }
    case "tool-input-available":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: String(c.toolCallId),
        status: "in_progress",
        rawInput: c.input,
      };
    case "tool-output-available":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: String(c.toolCallId),
        status: "completed",
        rawOutput: c.output,
      };
    case "tool-output-error":
      return {
        sessionUpdate: "tool_call_update",
        toolCallId: String(c.toolCallId),
        status: "failed",
        content: [
          {
            type: "content",
            content: { type: "text", text: String(c.errorText ?? "error") },
          },
        ],
      };
    case "error":
      return {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: String(c.errorText ?? "error") },
      };
    default:
      return null;
  }
}

/** Lower ACP prompt content blocks to the core's plain-text user message. */
export function promptText(blocks: ContentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "text") parts.push(block.text);
    else if (block.type === "resource_link") parts.push(block.uri);
    else if (block.type === "resource" && "text" in block.resource) {
      parts.push(block.resource.text);
    }
  }
  return parts.join("\n").trim();
}

export class AcpAgentAdapter implements Agent {
  private readonly sink: AcpUpdateSink;
  private readonly client: AcpCoreClient;
  private readonly agent: string;
  private readonly version: string;
  /** Sessions with a client-fired `session/cancel` in flight. */
  private readonly cancelled = new Set<string>();
  /** Serializes outward notifications so update order mirrors chunk order. */
  private outbound: Promise<void> = Promise.resolve();

  constructor(sink: AcpUpdateSink, options: AcpAgentAdapterOptions) {
    this.sink = sink;
    this.client = options.client;
    this.agent = options.agent ?? AGENT_SESSION_AGENT;
    this.version = options.version ?? "0.0.0";
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: Math.min(params.protocolVersion, PROTOCOL_VERSION),
      agentInfo: { name: "grida-agent", version: this.version },
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: false, audio: false },
      },
      // BYOK lives in the host's secret store; there is no ACP-level auth.
      authMethods: [],
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const row = await this.client.sessions.create({
      agent: this.agent,
      // The client's cwd is recorded as provenance; workspace binding is a
      // separate, capability-gated concern (acp.md §filesystem-authority).
      metadata: params.cwd ? { acp: { cwd: params.cwd } } : undefined,
    });
    return { sessionId: row.id };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const messages = await this.client.sessions.list_messages(params.sessionId);
    for (const message of messages) {
      if (message.hidden_at != null) continue;
      if (message.role !== "user" && message.role !== "assistant") continue;
      const text = message.parts
        .filter((p) => p.type === "text")
        .map((p) => (p.data as { text?: string }).text ?? "")
        .join("");
      if (!text) continue;
      this.push({
        sessionId: params.sessionId,
        update: {
          sessionUpdate:
            message.role === "user"
              ? "user_message_chunk"
              : "agent_message_chunk",
          content: { type: "text", text },
        },
      });
    }
    await this.outbound;
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const sessionId = params.sessionId;
    const text = promptText(params.prompt);
    this.cancelled.delete(sessionId);
    const handle = await this.client.agent.run(
      {
        messages: [{ role: "user", content: text }],
        session_id: sessionId,
      },
      (chunk) => {
        const update = translateChunk(chunk);
        if (update) this.push({ sessionId, update });
      }
    );
    let stopReason: StopReason = "end_turn";
    try {
      await handle.done;
    } catch (err) {
      if (!this.cancelled.has(sessionId)) throw err;
    }
    if (this.cancelled.delete(sessionId)) stopReason = "cancelled";
    await this.outbound;
    return { stopReason };
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.cancelled.add(params.sessionId);
    await this.client.agent.abort(params.sessionId);
  }

  /**
   * No ACP-level auth: `initialize` advertises zero `authMethods`
   * (credentials are the host's BYOK store), so a conforming client
   * never calls this. Answering instead of throwing keeps a
   * non-conforming client from wedging the connection.
   */
  async authenticate(): Promise<void> {}

  private push(notification: SessionNotification): void {
    this.outbound = this.outbound
      .then(() => this.sink.sessionUpdate(notification))
      .catch((err) => {
        // A dropped client connection must not wedge the run loop —
        // but a silent drop is undebuggable, so say so on stderr
        // (stdout is the JSON-RPC channel; stderr is free).
        console.error("[grida-agent acp] dropped session update:", err);
      });
  }
}
