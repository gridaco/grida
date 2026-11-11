/** Standalone ACP consumer contracts exercised through an in-memory agent. */
import { describe, expect, it } from "vitest";
import { openProvider, type ProviderChunk, type TurnResult } from "./index";
import { createFakeBridge } from "../testing/fake-acp-agent";

function textChunk(text: string) {
  return {
    sessionUpdate: "agent_message_chunk" as const,
    content: { type: "text" as const, text },
  };
}

describe("standalone ACP consumer", () => {
  it("streams ordered normalized reply events", async () => {
    const bridge = createFakeBridge({
      onPrompt: ({ emit }) => {
        for (const text of ["Hello", ", ", "world!"]) emit(textChunk(text));
        return "end_turn";
      },
    });
    const session = await openProvider(
      "claude",
      {},
      { connect: bridge.connect }
    );
    try {
      const chunks: ProviderChunk[] = [];
      const result = await session.prompt("say hello", (chunk) =>
        chunks.push(chunk)
      );
      expect(chunks).toEqual([
        { type: "text", text: "Hello" },
        { type: "text", text: ", " },
        { type: "text", text: "world!" },
      ]);
      expect(result.stopReason).toBe("end_turn");
    } finally {
      await session.dispose();
    }
  });

  it("sends the managed system prompt and the requested user text", async () => {
    const prompts: string[] = [];
    const bridge = createFakeBridge({
      onPrompt: ({ text }) => {
        prompts.push(text);
        return "end_turn";
      },
    });
    const session = await openProvider(
      "claude",
      {},
      { connect: bridge.connect }
    );
    try {
      await session.prompt("hi", () => {});
      const meta = bridge.calls.lastMeta as
        | { systemPrompt?: { append?: string } }
        | undefined;
      expect(typeof meta?.systemPrompt?.append).toBe("string");
      expect((meta?.systemPrompt?.append ?? "").length).toBeGreaterThan(0);
      expect(prompts).toEqual(["hi"]);
    } finally {
      await session.dispose();
    }
  });

  it("resumes the same external session after reopening its transport", async () => {
    const bridge = createFakeBridge({
      resume: true,
      onPrompt: () => "end_turn",
    });
    const firstSession = await openProvider(
      "claude",
      {},
      { connect: bridge.connect }
    );
    let first: TurnResult;
    try {
      first = await firstSession.prompt("my code word is ZUMBRA", () => {});
      expect(bridge.calls.newSession).toBe(1);
      expect(bridge.calls.resumeSession).toHaveLength(0);
      expect(first.providerSessionId).toBeTruthy();
    } finally {
      await firstSession.dispose();
    }
    const resumed = await openProvider(
      "claude",
      { resumeSessionId: first.providerSessionId },
      { connect: bridge.connect }
    );
    try {
      const next = await resumed.prompt("what was my code word?", () => {});
      expect(bridge.calls.resumeSession).toEqual([
        { sessionId: first.providerSessionId },
      ]);
      expect(bridge.calls.newSession).toBe(1);
      expect(next.providerSessionId).toBe(first.providerSessionId);
    } finally {
      await resumed.dispose();
    }
  });

  it("starts a fresh session when a stale session cannot be resumed", async () => {
    const bridge = createFakeBridge({
      resume: true,
      failResume: true,
      onPrompt: () => "end_turn",
    });
    const session = await openProvider(
      "claude",
      { resumeSessionId: "stale-sess-xyz" },
      { connect: bridge.connect }
    );
    try {
      const result = await session.prompt("continue please", () => {});
      expect(bridge.calls.resumeSession).toEqual([
        { sessionId: "stale-sess-xyz" },
      ]);
      expect(bridge.calls.newSession).toBe(1);
      expect(result.stopReason).toBe("end_turn");
      expect(result.providerSessionId).toBeTruthy();
      expect(result.providerSessionId).not.toBe("stale-sess-xyz");
    } finally {
      await session.dispose();
    }
  });

  it("cancels an in-flight prompt through the session API", async () => {
    const started = Promise.withResolvers<void>();
    const bridge = createFakeBridge({
      onPrompt: ({ signal, emit }) =>
        new Promise<string>((resolve) => {
          emit(textChunk("working"));
          signal.addEventListener("abort", () => resolve("cancelled"), {
            once: true,
          });
        }),
    });
    const session = await openProvider(
      "claude",
      {},
      { connect: bridge.connect }
    );
    try {
      const run = session.prompt("do a long thing", () => started.resolve());
      await started.promise;
      await session.cancel();
      const result = await run;
      expect(bridge.calls.cancel).toBe(1);
      expect(result.stopReason).toBe("cancelled");
    } finally {
      await session.dispose();
    }
  });
});
