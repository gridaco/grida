/**
 * Deterministic in-memory fake of an ACP agent (issue #813 JTBD suite).
 *
 * The agent-provider path drives an EXTERNAL agent that honors none of Grida's
 * internal contracts, so the only meaningful tests are at the user-outcome
 * boundary: "what does the user get?". This harness lets those tests run in CI
 * with NO real Claude and NO `npx` — we script the agent's ACP behavior and
 * assert Grida's consumer output (`runAgentProviderTurn`'s `AgentUIMessageChunk`s,
 * and which ACP methods the consumer calls).
 *
 * Mechanism: the ACP SDK exposes both halves of a connection. We build a real
 * `AgentSideConnection` driven by a scripted {@link Agent}, wire it to Grida's
 * real `ClientSideConnection` over an in-memory duplex (two `TransformStream`
 * byte pipes — `ndJsonStream` works over any web stream, not just stdio), and
 * hand the client end back as a {@link BridgeConnect}. Inject it via
 * `runAgentProviderTurn({ connect })` / `openClaudeSession(opts, { connect })`.
 */
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type AuthenticateResponse,
  type InitializeResponse,
  type NewSessionResponse,
  type PromptResponse,
  type ResumeSessionResponse,
  type SessionNotification,
  type SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import type { BridgeConnect, BridgeTransport } from "../agent-provider";

/** One ACP `session/update` payload (the streaming vocabulary). */
type SessionUpdate = SessionNotification["update"];

export type FakePromptContext = {
  sessionId: string;
  /** The user text the consumer sent (first text content block). */
  text: string;
  /** Push a `session/update` notification to the client (token streaming). */
  emit: (update: SessionUpdate) => void;
  /** Fires when the consumer cancels (ACP `session/cancel` → agent `cancel`). */
  signal: AbortSignal;
};

export type FakeAgentScript = {
  /** Advertise `session/resume` so the consumer resumes instead of re-new'ing. */
  resume?: boolean;
  /**
   * Reject `session/resume` (still recording the attempt) — simulates a stale
   * or unknown id after a bridge restart, to exercise the consumer's fallback.
   */
  failResume?: boolean;
  /** Run one prompt turn: stream updates via `emit`, return the ACP stop reason. */
  onPrompt: (ctx: FakePromptContext) => string | Promise<string>;
};

/** ACP methods the consumer invoked — the assertion surface for wiring tests. */
export type FakeBridgeCalls = {
  initialize: number;
  newSession: number;
  resumeSession: Array<{ sessionId: string }>;
  setSessionMode: Array<{ sessionId: string; modeId: string }>;
  cancel: number;
};

export type FakeBridge = {
  /** Inject as the `connect` dep. */
  connect: BridgeConnect;
  /** Observed calls, shared across every turn this bridge serves. */
  calls: FakeBridgeCalls;
};

/** Build a fake bridge from a behavior script. */
export function createFakeBridge(script: FakeAgentScript): FakeBridge {
  const calls: FakeBridgeCalls = {
    initialize: 0,
    newSession: 0,
    resumeSession: [],
    setSessionMode: [],
    cancel: 0,
  };
  // Shared across connects so resumed/repeat turns get distinct session ids.
  let seq = 0;

  const connect: BridgeConnect = () => {
    // In-memory duplex: client→agent and agent→client byte pipes.
    const c2a = new TransformStream<Uint8Array, Uint8Array>();
    const a2c = new TransformStream<Uint8Array, Uint8Array>();
    const agentStream = ndJsonStream(a2c.writable, c2a.readable);
    const clientStream = ndJsonStream(c2a.writable, a2c.readable);

    // Per-connection cancel: `close()` and the agent's `cancel` both trip it,
    // unblocking any pending `onPrompt` that awaits the signal.
    const abort = new AbortController();

    const agentConn = new AgentSideConnection((conn): Agent => {
      return {
        async initialize(): Promise<InitializeResponse> {
          calls.initialize++;
          return {
            protocolVersion: PROTOCOL_VERSION,
            agentCapabilities: {
              sessionCapabilities: script.resume ? { resume: {} } : {},
            },
          } as InitializeResponse;
        },
        async newSession(): Promise<NewSessionResponse> {
          calls.newSession++;
          return { sessionId: `fake-sess-${++seq}` } as NewSessionResponse;
        },
        async resumeSession(params): Promise<ResumeSessionResponse> {
          calls.resumeSession.push({ sessionId: String(params.sessionId) });
          if (script.failResume) {
            throw new Error("fake: unknown or stale session id");
          }
          return {} as ResumeSessionResponse;
        },
        async setSessionMode(params): Promise<SetSessionModeResponse> {
          calls.setSessionMode.push({
            sessionId: String(params.sessionId),
            modeId: String(params.modeId),
          });
          return {} as SetSessionModeResponse;
        },
        async authenticate(): Promise<AuthenticateResponse> {
          return {} as AuthenticateResponse;
        },
        async prompt(params): Promise<PromptResponse> {
          const first = params.prompt[0];
          const text = first?.type === "text" ? first.text : "";
          const stopReason = await script.onPrompt({
            sessionId: String(params.sessionId),
            text,
            emit: (update) =>
              void conn.sessionUpdate({ sessionId: params.sessionId, update }),
            signal: abort.signal,
          });
          return { stopReason } as PromptResponse;
        },
        async cancel(): Promise<void> {
          calls.cancel++;
          abort.abort();
        },
      };
    }, agentStream);

    const transport: BridgeTransport = {
      stream: clientStream,
      errorTail: () => "",
      close: () => {
        void agentConn; // retain the agent side for the turn's lifetime
        if (!abort.signal.aborted) abort.abort();
      },
    };
    return transport;
  };

  return { connect, calls };
}
