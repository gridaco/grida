/**
 * Controller-level admission regression for a session paused on human input.
 *
 * The server rejects a direct NEW turn while an approval/question is pending.
 * The surface must therefore lower an ordinary follow-up to the durable queue,
 * even though no run is busy.
 */

import { describe, expect, it } from "vitest";
import { turnQueueSubmitAction } from "./use-turn-queue-controller";

describe("turnQueueSubmitAction", () => {
  it("queues ordinary text while human input is pending and the run is idle", () => {
    expect(
      turnQueueSubmitAction({
        text: "  continue with a simpler version  ",
        sessionId: "ses_1",
        busy: false,
        admissionBlocked: true,
        hasSendContext: false,
      })
    ).toEqual({
      type: "enqueue",
      sessionId: "ses_1",
      text: "continue with a simpler version",
    });
  });

  it("sends the same ordinary text immediately when idle and unblocked", () => {
    expect(
      turnQueueSubmitAction({
        text: "continue with a simpler version",
        sessionId: "ses_1",
        busy: false,
        admissionBlocked: false,
        hasSendContext: false,
      })
    ).toEqual({
      type: "send",
      text: "continue with a simpler version",
      files: undefined,
      extras: undefined,
    });
  });

  it("queues while authoritative status is unavailable instead of racing a direct run", () => {
    expect(
      turnQueueSubmitAction({
        text: "follow up during reconnect",
        sessionId: "ses_1",
        busy: false,
        admissionBlocked: true,
        hasSendContext: false,
      })
    ).toEqual({
      type: "enqueue",
      sessionId: "ses_1",
      text: "follow up during reconnect",
    });
  });

  it("never direct-sends attachment payloads across a pending interaction", () => {
    const file = {
      type: "file" as const,
      mediaType: "image/png",
      url: "data:image/png;base64,AA==",
      filename: "reference.png",
    };

    expect(
      turnQueueSubmitAction({
        text: "use this reference",
        files: [file],
        sessionId: "ses_1",
        busy: false,
        admissionBlocked: true,
        hasSendContext: false,
      })
    ).toEqual({
      type: "enqueue",
      sessionId: "ses_1",
      text: "use this reference",
    });
    expect(
      turnQueueSubmitAction({
        text: "",
        files: [file],
        sessionId: "ses_1",
        busy: false,
        admissionBlocked: true,
        hasSendContext: false,
      })
    ).toEqual({ type: "ignore" });
  });
});
