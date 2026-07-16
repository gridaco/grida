/**
 * Bridge: run ONE agent-provider turn (Grida as ACP consumer, issue #813) and
 * push the result into the host stream as AI-SDK v6 `AgentUIMessageChunk`s —
 * the wire the recorder + renderer already consume. The only place
 * `ProviderChunk` (the agent-provider class's neutral vocabulary) is lowered
 * into the host chunk format.
 *
 * Streaming-aware: ACP delivers `agent_message_chunk` deltas, so we open ONE
 * text part lazily, emit a `text-delta` per delta (live token streaming in the
 * UI), and close it at the turn's end. Reasoning mirrors that; tool calls
 * follow the AI-SDK state machine.
 */
import {
  openProvider,
  type AgentProviderId,
  type BridgeConnect,
  type ProviderChunk,
  type TurnResult,
} from "../agent-provider";
import type { AgentUIMessageChunk } from "../protocol/wire";

type Emit = (chunk: AgentUIMessageChunk) => void;

/** AI-SDK `finishReason` from an ACP `StopReason` — keep the distinctions the
 *  UI cares about (length cap, refusal, cancel) instead of flattening to
 *  `"other"`. Unknown reasons fall through to `"other"`. */
function finishReasonFromStop(stopReason: string): string {
  switch (stopReason) {
    case "end_turn":
      return "stop";
    case "max_tokens":
    case "max_turn_requests":
      return "length";
    case "refusal":
      return "content-filter";
    case "cancelled":
      return "other"; // user-initiated abort, not a model failure
    default:
      return "other";
  }
}

export async function runAgentProviderTurn(opts: {
  provider_id: AgentProviderId;
  prompt: string;
  /**
   * GRIDA-SEC-004 — host attestation consumed only when
   * `external_agent_execution` is `"sandboxed"`.
   */
  sandbox_enforced: boolean;
  /**
   * GRIDA-SEC-004 — explicit host disposition for the ACP process capability.
   * The runtime resolves omission at its construction boundary; this final
   * spawn seam requires the resolved value so non-HTTP paths cannot bypass it.
   */
  external_agent_execution: "enabled" | "sandboxed" | "disabled";
  cwd?: string;
  /** Resume the external agent's prior session (continuity). */
  resume_session_id?: string;
  /** Vendor model id chosen by the picker (issue #813); default if absent. */
  model?: string;
  signal?: AbortSignal;
  /**
   * Transport injection for tests — a deterministic in-memory fake ACP agent
   * (`testing/fake-acp-agent`). Production omits it, so the real npx bridge
   * spawns. This is the seam the JTBD suite drives.
   */
  connect?: BridgeConnect;
  emit: Emit;
}): Promise<TurnResult> {
  if (opts.external_agent_execution === "disabled") {
    throw new Error(
      `[agent-host-providers] external agent ${opts.provider_id} is disabled by the host`
    );
  }
  if (opts.external_agent_execution === "sandboxed" && !opts.sandbox_enforced) {
    throw new Error(
      `[agent-host-providers] external agent ${opts.provider_id} requires an enforced OS sandbox`
    );
  }
  const session = await openProvider(
    opts.provider_id,
    {
      cwd: opts.cwd,
      resumeSessionId: opts.resume_session_id,
      model: opts.model,
    },
    { connect: opts.connect }
  );

  // Map the turn's abort to ACP `session/cancel`. Handle the
  // already-aborted-before-we-subscribed case too (the signal may fire while
  // `openProvider` is still handshaking).
  const onAbort = () => void session.cancel();
  if (opts.signal?.aborted) void session.cancel();
  else opts.signal?.addEventListener("abort", onAbort, { once: true });

  let n = 0;
  const nextId = () => `ap${n++}`;
  let textId: string | null = null;
  let reasoningId: string | null = null;
  const startedTools = new Set<string>();

  const closeText = () => {
    if (textId) {
      opts.emit({ type: "text-end", id: textId } as AgentUIMessageChunk);
      textId = null;
    }
  };
  const closeReasoning = () => {
    if (reasoningId) {
      opts.emit({
        type: "reasoning-end",
        id: reasoningId,
      } as AgentUIMessageChunk);
      reasoningId = null;
    }
  };

  opts.emit({ type: "start" } as AgentUIMessageChunk);
  opts.emit({ type: "start-step" } as AgentUIMessageChunk);
  try {
    const result = await session.prompt(opts.prompt, (pc: ProviderChunk) => {
      switch (pc.type) {
        case "text": {
          closeReasoning();
          if (!textId) {
            textId = nextId();
            opts.emit({
              type: "text-start",
              id: textId,
            } as AgentUIMessageChunk);
          }
          opts.emit({
            type: "text-delta",
            id: textId,
            delta: pc.text,
          } as AgentUIMessageChunk);
          break;
        }
        case "reasoning": {
          closeText();
          if (!reasoningId) {
            reasoningId = nextId();
            opts.emit({
              type: "reasoning-start",
              id: reasoningId,
            } as AgentUIMessageChunk);
          }
          opts.emit({
            type: "reasoning-delta",
            id: reasoningId,
            delta: pc.text,
          } as AgentUIMessageChunk);
          break;
        }
        case "tool": {
          if (!startedTools.has(pc.id)) {
            startedTools.add(pc.id);
            opts.emit({
              type: "tool-input-start",
              toolCallId: pc.id,
              toolName: pc.name,
            } as AgentUIMessageChunk);
            opts.emit({
              type: "tool-input-available",
              toolCallId: pc.id,
              toolName: pc.name,
              input: pc.detail ? { detail: pc.detail } : {},
            } as AgentUIMessageChunk);
          }
          if (pc.status === "completed" || pc.status === "failed") {
            opts.emit({
              type: "tool-output-available",
              toolCallId: pc.id,
              output: { status: pc.status, detail: pc.detail ?? null },
            } as AgentUIMessageChunk);
          }
          break;
        }
        case "error":
          opts.emit({
            type: "error",
            errorText: pc.message,
          } as AgentUIMessageChunk);
          break;
      }
    });
    closeText();
    closeReasoning();
    opts.emit({ type: "finish-step" } as AgentUIMessageChunk);
    opts.emit({
      type: "finish",
      finishReason: finishReasonFromStop(result.stopReason),
    } as AgentUIMessageChunk);
    return result;
  } finally {
    opts.signal?.removeEventListener("abort", onAbort);
    await session.dispose();
  }
}
