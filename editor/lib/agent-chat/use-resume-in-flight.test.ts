/**
 * Contract tests for the resume-in-flight decision core (RFC
 * docs/wg/ai/agent/session.md — abort-vs-tcp-close / resume).
 *
 * The bug this guards against: `useChat({ resume: true })` resumes only
 * once on mount, against the placeholder chat that has no session id yet
 * (the id is restored async from localStorage), so a renderer refresh
 * never reconnects to the still-running turn. `decideResumeInFlight`
 * encodes the replacement rule — resume once per chat instance that has a
 * real session id, but NEVER over a turn this client is streaming itself
 * (fresh-chat mid-stream id adoption). If either regresses, these fail
 * here rather than only in a hard-to-reproduce desktop session.
 */

import { describe, expect, it } from "vitest";
import { decideResumeInFlight } from "./use-resume-in-flight";

describe("decideResumeInFlight", () => {
  it("skips while no session id is known (the placeholder-chat mount frame)", () => {
    // This is exactly the refresh race: at mount `current_id` is still null
    // (restored async), so there is nothing to reconnect to yet.
    expect(
      decideResumeInFlight({
        hasSession: false,
        isStreaming: false,
        alreadyClaimed: false,
      })
    ).toBe("skip");
  });

  it("resumes once a real session id is known and the client is idle", () => {
    // The fix: after the async restore rebuilds the Chat with the real id,
    // THIS is the frame that must reconnect — the one `resume: true` missed.
    expect(
      decideResumeInFlight({
        hasSession: true,
        isStreaming: false,
        alreadyClaimed: false,
      })
    ).toBe("resume");
  });

  it("claims WITHOUT resuming when this client is streaming the turn", () => {
    // Fresh-chat mid-stream id adoption: sessionId flips null→known while the
    // Chat instance is unchanged and actively streaming. Resuming here would
    // open a 2nd stream over the live send (the supervised-approval cut-off).
    expect(
      decideResumeInFlight({
        hasSession: true,
        isStreaming: true,
        alreadyClaimed: false,
      })
    ).toBe("claim-only");
  });

  it("skips an instance it already claimed (no double-resume)", () => {
    expect(
      decideResumeInFlight({
        hasSession: true,
        isStreaming: false,
        alreadyClaimed: true,
      })
    ).toBe("skip");
    // A claimed instance stays skipped even if it later streams.
    expect(
      decideResumeInFlight({
        hasSession: true,
        isStreaming: true,
        alreadyClaimed: true,
      })
    ).toBe("skip");
  });
});
