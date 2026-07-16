/**
 * JTBD ("jobs to be done") suite for the agent-provider path (issue #813).
 *
 * The external ACP agent honors none of Grida's internal contracts, so these
 * tests assert ONLY the user-visible outcome — "what does the user get?" —
 * against a deterministic in-memory fake agent (`testing/fake-acp-agent`). They
 * pin WHAT must hold regardless of HOW the spike implements it, run in CI with
 * no real Claude, and complement the gated end-to-end `run.live.test.ts`.
 *
 * This is the PROOF SLICE: streaming + continuity (passing), and one
 * gap-pinning skip (cancel). The full JTBD table lives in
 * `docs/wg/ai/agent/acp-provider.plan.md`.
 */
import { describe, expect, it } from "vitest";
import { runAgentProviderTurn } from "../runtime/agent-provider-run";
import type { AgentUIMessageChunk } from "../protocol/wire";
import { createFakeBridge } from "../testing/fake-acp-agent";

/** A text `session/update` chunk, the way a real agent streams a token. */
function textChunk(text: string) {
  return {
    sessionUpdate: "agent_message_chunk" as const,
    content: { type: "text" as const, text },
  };
}

describe("agent-provider JTBD (issue #813)", () => {
  it("streams the assistant reply to the user as ordered text deltas", async () => {
    const bridge = createFakeBridge({
      onPrompt: ({ emit }) => {
        for (const t of ["Hello", ", ", "world!"]) emit(textChunk(t));
        return "end_turn";
      },
    });

    const chunks: AgentUIMessageChunk[] = [];
    const result = await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "say hello",
      connect: bridge.connect,
      emit: (c) => chunks.push(c),
    });

    // JTBD: the user sees the reply arrive incrementally, assembling to the
    // full text — not one blob, not reordered.
    const deltas = chunks
      .filter((c) => c.type === "text-delta")
      .map((c) => (c as { delta: string }).delta);
    expect(deltas).toEqual(["Hello", ", ", "world!"]);
    expect(deltas.join("")).toBe("Hello, world!");

    // ...and the stream is well-formed: a text part opens before its deltas
    // and closes, and the turn ends with `finish`.
    const types = chunks.map((c) => c.type);
    expect(types.indexOf("text-start")).toBeGreaterThanOrEqual(0);
    expect(types.indexOf("text-start")).toBeLessThan(
      types.indexOf("text-delta")
    );
    expect(types).toContain("text-end");
    expect(types.at(-1)).toBe("finish");
    expect(result.stopReason).toBe("end_turn");
  });

  it("hands our managed system prompt to the agent", async () => {
    const bridge = createFakeBridge({ onPrompt: () => "end_turn" });
    await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "hi",
      connect: bridge.connect,
      emit: () => {},
    });
    // We append a managed system prompt (registry `prompts.acp_system`) onto
    // Claude Code's preset — assert it reaches the agent's session, without
    // pinning the exact text (so editing the prompt copy doesn't break this).
    const meta = bridge.calls.lastMeta as
      | { systemPrompt?: { append?: string } }
      | undefined;
    expect(typeof meta?.systemPrompt?.append).toBe("string");
    expect((meta?.systemPrompt?.append ?? "").length).toBeGreaterThan(0);
  });

  it("continues the SAME external session on a follow-up turn", async () => {
    const bridge = createFakeBridge({
      resume: true, // advertise session/resume so the consumer resumes
      onPrompt: ({ emit }) => {
        emit(textChunk("ok"));
        return "end_turn";
      },
    });

    // Turn 1: no prior id → the consumer mints a fresh external session.
    const first = await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "my code word is ZUMBRA",
      connect: bridge.connect,
      emit: () => {},
    });
    expect(bridge.calls.newSession).toBe(1);
    expect(bridge.calls.resumeSession).toHaveLength(0);
    expect(first.providerSessionId).toBeTruthy();

    // Turn 2: carry the id forward → the consumer RESUMES that session and
    // does NOT open a second one. (Continuity is what lets the agent recall
    // turn 1; here we assert the consumer's half of that contract.)
    await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "what was my code word?",
      resume_session_id: first.providerSessionId,
      connect: bridge.connect,
      emit: () => {},
    });
    expect(bridge.calls.resumeSession).toEqual([
      { sessionId: first.providerSessionId },
    ]);
    expect(bridge.calls.newSession).toBe(1); // still 1 — no re-new
  });

  it("falls back to a fresh session when a stale id can't be resumed", async () => {
    const bridge = createFakeBridge({
      resume: true, // advertise resume...
      failResume: true, // ...but reject the actual resume (bridge forgot it)
      onPrompt: ({ emit }) => {
        emit(textChunk("fresh"));
        return "end_turn";
      },
    });

    const turn = await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "continue please",
      resume_session_id: "stale-sess-xyz",
      connect: bridge.connect,
      emit: () => {},
    });

    // JTBD: a dead resume id doesn't crash the turn — the consumer tries
    // resume, then quietly starts a fresh session and the turn completes.
    expect(bridge.calls.resumeSession).toEqual([
      { sessionId: "stale-sess-xyz" },
    ]);
    expect(bridge.calls.newSession).toBe(1); // fell back to a fresh session
    expect(turn.stopReason).toBe("end_turn");
    expect(turn.providerSessionId).toBeTruthy(); // a usable (new) id
  });

  it("aborting the run cancels the external turn (JTBD: cancel)", async () => {
    // The fake holds the turn open until the cancel arrives, then ends it with
    // a `cancelled` stop reason — mirroring a real agent's response to ACP
    // `session/cancel`.
    const bridge = createFakeBridge({
      onPrompt: ({ signal, emit }) =>
        new Promise<string>((resolve) => {
          emit(textChunk("working…"));
          if (signal.aborted) return resolve("cancelled");
          signal.addEventListener("abort", () => resolve("cancelled"), {
            once: true,
          });
        }),
    });

    const ac = new AbortController();
    const run = runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: true,
      external_agent_execution: "sandboxed",
      prompt: "do a long thing",
      signal: ac.signal,
      connect: bridge.connect,
      emit: () => {},
    });
    ac.abort(); // fires while the turn is in flight

    const turn = await run;
    // JTBD: the abort reaches the external agent (ACP session/cancel) and the
    // turn ends as cancelled rather than hanging.
    expect(bridge.calls.cancel).toBeGreaterThan(0);
    expect(turn.stopReason).toBe("cancelled");
  });

  it("maps the external stop reason to a meaningful finish reason", async () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["end_turn", "stop"],
      ["max_tokens", "length"],
      ["refusal", "content-filter"],
      ["cancelled", "other"],
    ];
    for (const [stopReason, expected] of cases) {
      const bridge = createFakeBridge({ onPrompt: () => stopReason });
      const chunks: AgentUIMessageChunk[] = [];
      await runAgentProviderTurn({
        provider_id: "claude",
        sandbox_enforced: true,
        external_agent_execution: "sandboxed",
        prompt: "x",
        connect: bridge.connect,
        emit: (c) => chunks.push(c),
      });
      const finish = chunks.find((c) => c.type === "finish") as
        | { finishReason?: string }
        | undefined;
      expect(finish?.finishReason).toBe(expected);
    }
  });

  it("GRIDA-SEC-004: refuses before opening ACP without an enforced sandbox", async () => {
    const bridge = createFakeBridge({ onPrompt: () => "end_turn" });

    await expect(
      runAgentProviderTurn({
        provider_id: "claude",
        sandbox_enforced: false,
        external_agent_execution: "sandboxed",
        prompt: "must not reach the process",
        connect: bridge.connect,
        emit: () => {},
      })
    ).rejects.toThrow(/requires an enforced OS sandbox/);
    expect(bridge.calls.initialize).toBe(0);
    expect(bridge.calls.newSession).toBe(0);
  });

  it("GRIDA-SEC-004: enabled mode preserves host-authorized unsandboxed execution", async () => {
    const bridge = createFakeBridge({ onPrompt: () => "end_turn" });

    const turn = await runAgentProviderTurn({
      provider_id: "claude",
      sandbox_enforced: false,
      external_agent_execution: "enabled",
      prompt: "host explicitly authorized this process",
      connect: bridge.connect,
      emit: () => {},
    });

    expect(bridge.calls.initialize).toBeGreaterThan(0);
    expect(bridge.calls.newSession).toBe(1);
    expect(turn.stopReason).toBe("end_turn");
  });

  it("GRIDA-SEC-004: refuses before opening ACP when the host disables it", async () => {
    const bridge = createFakeBridge({ onPrompt: () => "end_turn" });

    await expect(
      runAgentProviderTurn({
        provider_id: "claude",
        sandbox_enforced: true,
        external_agent_execution: "disabled",
        prompt: "must not reach the process",
        connect: bridge.connect,
        emit: () => {},
      })
    ).rejects.toThrow(/disabled by the host/);
    expect(bridge.calls.initialize).toBe(0);
    expect(bridge.calls.newSession).toBe(0);
  });
});
