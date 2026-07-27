import { describe, expect, it } from "vitest";
import type { ComposerMessage } from "@/kits/composer";
import {
  AgentComposerQueueSubmitGuard,
  isSameComposerDraft,
} from "./agent-composer-queue-submit";

function message(input: {
  text: string;
  submittedAt?: number;
  contextSource?: string;
  attachmentId?: string;
}): ComposerMessage {
  const attachment = input.attachmentId
    ? {
        id: input.attachmentId,
        name: `${input.attachmentId}.txt`,
        mime: "text/plain",
      }
    : null;
  return {
    role: "user",
    parts: [
      { type: "text", text: input.text },
      ...(attachment
        ? [{ type: "file-attachment" as const, ...attachment }]
        : []),
      {
        type: "editor-context",
        kind: "selection",
        source: input.contextSource,
        payload: {},
        emitted_at: 1,
      },
    ],
    meta: {
      text: input.text,
      attachments: attachment ? [attachment] : [],
      submitted_at: input.submittedAt ?? 1,
    },
  };
}

describe("AgentComposerQueueSubmitGuard", () => {
  it("admits one submit synchronously until its acknowledgement settles", () => {
    const guard = new AgentComposerQueueSubmitGuard();
    guard.mount();

    const lease = guard.begin();
    expect(lease).not.toBeNull();
    expect(guard.inFlight).toBe(true);
    expect(guard.begin()).toBeNull();

    expect(guard.finish(lease!)).toBe(true);
    expect(guard.inFlight).toBe(false);
    expect(guard.begin()).not.toBeNull();
  });

  it("makes a late acknowledgement inert after unmount or remount", () => {
    const guard = new AgentComposerQueueSubmitGuard();
    guard.mount();
    const stale = guard.begin()!;

    guard.unmount();
    expect(guard.owns(stale)).toBe(false);
    expect(guard.finish(stale)).toBe(false);

    guard.mount();
    const current = guard.begin()!;
    expect(guard.owns(stale)).toBe(false);
    expect(guard.owns(current)).toBe(true);
  });

  it("lets a rebound session submit while making the old acknowledgement inert", () => {
    const guard = new AgentComposerQueueSubmitGuard();
    guard.mount();
    const firstSession = guard.begin(1)!;

    expect(guard.inFlightFor(1)).toBe(true);
    expect(guard.inFlightFor(2)).toBe(false);
    expect(guard.owns(firstSession, 2)).toBe(false);

    const secondSession = guard.begin(2)!;
    expect(guard.owns(firstSession)).toBe(false);
    expect(guard.finish(firstSession)).toBe(false);
    expect(guard.owns(secondSession, 2)).toBe(true);
  });
});

describe("isSameComposerDraft", () => {
  it("ignores acknowledgement time and host-owned context churn", () => {
    expect(
      isSameComposerDraft(
        message({ text: "queue me", submittedAt: 1, contextSource: "old" }),
        message({ text: "queue me", submittedAt: 2, contextSource: "new" })
      )
    ).toBe(true);
  });

  it("retains a newer draft instead of clearing it on a late acknowledgement", () => {
    expect(
      isSameComposerDraft(
        message({ text: "queue me" }),
        message({ text: "new draft for another session" })
      )
    ).toBe(false);
  });

  it("retains newly attached resources even when the text is unchanged", () => {
    expect(
      isSameComposerDraft(
        message({ text: "queue me" }),
        message({ text: "queue me", attachmentId: "newer" })
      )
    ).toBe(false);
  });
});
