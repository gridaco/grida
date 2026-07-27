import { describe, expect, it } from "vitest";
import { chatError } from "./chat-error";

/** The AI SDK's UIMessageStreamError shape (name is the contract). */
function streamStateError(): Error {
  const err = new Error('No tool invocation found for tool call ID "toolu_x".');
  err.name = "AI_UIMessageStreamError";
  return err;
}

describe("chatError.classify", () => {
  it("detects the GRIDA-GG wire codes (bare literal message contract)", () => {
    expect(chatError.classify(new Error("gg_token_expired"))).toBe(
      "gg-token-expired"
    );
    expect(chatError.classify(new Error("insufficient_credits"))).toBe(
      "gg-insufficient-credits"
    );
  });

  it("detects a reducer death by the SDK error name", () => {
    expect(chatError.classify(streamStateError())).toBe("stream-state");
  });

  it("detects the pending-human-input 409 before and after desktop error serialization", () => {
    expect(
      chatError.classify({
        code: "human-input-pending",
        message: "request refused",
      })
    ).toBe("human-input-pending");
    expect(
      chatError.classify(
        new Error(
          "[grida] /agent/run: a human-input block (approval or question) is pending"
        )
      )
    ).toBe("human-input-pending");
    expect(
      chatError.classify({
        code: "approval-resume-with-new-message",
        message: "request refused",
      })
    ).toBe("human-input-pending");
  });

  it("detects a losing atomic-admission race before and after desktop serialization", () => {
    expect(
      chatError.classify({
        code: "run_in_flight",
        message: "request refused",
      })
    ).toBe("run-in-flight");
    expect(
      chatError.classify(
        new Error("[grida] /agent/run: run already in flight for session ses_1")
      )
    ).toBe("run-in-flight");
  });

  it("detects torn-connection TypeErrors across browser wordings", () => {
    // Chromium
    expect(chatError.classify(new TypeError("network error"))).toBe(
      "disconnect"
    );
    expect(chatError.classify(new TypeError("Failed to fetch"))).toBe(
      "disconnect"
    );
    // WebKit
    expect(chatError.classify(new TypeError("Load failed"))).toBe("disconnect");
    // A non-TypeError with the same words is NOT a disconnect.
    expect(chatError.classify(new Error("network error"))).toBe("unknown");
  });

  it("everything else is unknown", () => {
    expect(chatError.classify(new Error("boom"))).toBe("unknown");
    expect(chatError.classify(undefined)).toBe("unknown");
    expect(chatError.classify("plain string")).toBe("unknown");
  });
});

describe("chatError.recoverable", () => {
  it("recovers failures where durable server state remains authoritative", () => {
    expect(chatError.recoverable("disconnect")).toBe(true);
    expect(chatError.recoverable("stream-state")).toBe(true);
    expect(chatError.recoverable("human-input-pending")).toBe(true);
    expect(chatError.recoverable("run-in-flight")).toBe(true);
    expect(chatError.recoverable("gg-token-expired")).toBe(false);
    expect(chatError.recoverable("gg-insufficient-credits")).toBe(false);
    expect(chatError.recoverable("unknown")).toBe(false);
  });
});

describe("chatError.describe", () => {
  it("keeps the GG copy verbatim (moved from the agent pane banner)", () => {
    expect(chatError.describe(new Error("gg_token_expired"))).toBe(
      "Your Grida session needed a refresh — try sending again."
    );
    expect(chatError.describe(new Error("insufficient_credits"))).toBe(
      "Your organization is out of AI credits."
    );
  });

  it("never surfaces the laundered browser/reducer text", () => {
    const disconnect = chatError.describe(new TypeError("network error"));
    expect(disconnect).toBe("The connection to the agent was interrupted.");
    const desync = chatError.describe(streamStateError());
    expect(desync).toBe("The live view lost sync with the agent.");
    expect(desync).not.toContain("No tool invocation found");
  });

  it("explains a pending interaction instead of surfacing the HTTP text", () => {
    expect(
      chatError.describe(
        new Error(
          "[grida] /agent/run: a human-input block (approval or question) is pending"
        )
      )
    ).toBe("The agent is waiting for your response before it can continue.");
  });

  it("explains that a losing concurrent send is being queued", () => {
    expect(
      chatError.describe({
        code: "run_in_flight",
        message: "request refused",
      })
    ).toBe("Another turn started first. Your message is waiting to be queued.");
  });

  it("unknown errors pass their message through (with a fallback)", () => {
    expect(chatError.describe(new Error("custom failure"))).toBe(
      "custom failure"
    );
    expect(chatError.describe(undefined)).toBe("Something went wrong.");
  });
});
