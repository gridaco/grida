import { describe, expect, it, vi } from "vitest";
import type { UIMessage } from "ai";
import { StreamRecovery } from "./stream-recovery";

function user(id: string, parts: UIMessage["parts"]): UIMessage {
  return { id, role: "user", parts };
}

describe("StreamRecovery.pendingUserTail", () => {
  it("extracts only the final text-only optimistic user tail", () => {
    expect(
      StreamRecovery.pendingUserTail([
        user("u1", [{ type: "text", text: "first" }]),
        { id: "a1", role: "assistant", parts: [] },
        user("u2", [
          { type: "text", text: "  follow up  " },
          { type: "text", text: "please" },
        ]),
      ])
    ).toEqual({ id: "u2", text: "follow up  \n\nplease" });
  });

  it("rejects assistant, empty, and non-text tails", () => {
    expect(
      StreamRecovery.pendingUserTail([
        { id: "a1", role: "assistant", parts: [] },
      ])
    ).toBeNull();
    expect(
      StreamRecovery.pendingUserTail([
        user("u1", [{ type: "text", text: "   " }]),
      ])
    ).toBeNull();
    expect(
      StreamRecovery.pendingUserTail([
        user("u1", [
          { type: "text", text: "look" },
          {
            type: "file",
            mediaType: "image/png",
            url: "data:image/png;base64,AA==",
          },
        ]),
      ])
    ).toBeNull();
  });
});

describe("StreamRecovery.run", () => {
  it("queues a rejected user tail before rehydrate, apply, and resume", async () => {
    const order: string[] = [];
    const restored: UIMessage[] = [{ id: "a1", role: "assistant", parts: [] }];
    const applyMessages = vi.fn<(messages: UIMessage[]) => void>(() => {
      order.push("apply");
    });
    const ok = await StreamRecovery.run({
      kind: "human-input-pending",
      messages: [user("u2", [{ type: "text", text: "follow up" }])],
      enqueuePendingTail: async (tail) => {
        expect(tail).toEqual({ id: "u2", text: "follow up" });
        order.push("enqueue");
        return true;
      },
      rehydrate: async () => {
        order.push("rehydrate");
        return restored;
      },
      applyMessages,
      resumeStream: () => {
        order.push("resume");
      },
    });

    expect(ok).toBe(true);
    expect(order).toEqual(["enqueue", "rehydrate", "apply", "resume"]);
    expect(applyMessages).toHaveBeenCalledWith(restored);
  });

  it("uses the same durable move when another window wins run admission", async () => {
    const order: string[] = [];
    expect(
      await StreamRecovery.run({
        kind: "run-in-flight",
        messages: [user("u2", [{ type: "text", text: "follow up" }])],
        enqueuePendingTail: async (tail) => {
          expect(tail).toEqual({ id: "u2", text: "follow up" });
          order.push("enqueue");
          return true;
        },
        rehydrate: async () => {
          order.push("rehydrate");
          return [];
        },
        applyMessages: () => {
          order.push("apply");
        },
        resumeStream: () => {
          order.push("resume");
        },
      })
    ).toBe(true);
    expect(order).toEqual(["enqueue", "rehydrate", "apply", "resume"]);
  });

  it("still restores pending controls when a non-text tail cannot be queued", async () => {
    const prior: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [],
    };
    const applyMessages = vi.fn<(messages: UIMessage[]) => void>();
    const rehydrate = vi.fn<() => Promise<UIMessage[]>>(async () => [prior]);
    expect(
      await StreamRecovery.run({
        kind: "human-input-pending",
        messages: [
          prior,
          user("u1", [
            {
              type: "file",
              mediaType: "image/png",
              url: "data:image/png;base64,AA==",
            },
          ]),
        ],
        rehydrate,
        applyMessages,
        resumeStream: vi.fn<() => void>(),
      })
    ).toBe(false);
    expect(rehydrate).toHaveBeenCalledOnce();
    expect(applyMessages).toHaveBeenCalledWith([prior]);
  });

  it("falls back to removing the rejected optimistic tail when hydration fails", async () => {
    const prior: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [],
    };
    const applyMessages = vi.fn<(messages: UIMessage[]) => void>();
    expect(
      await StreamRecovery.run({
        kind: "human-input-pending",
        messages: [prior, user("u1", [{ type: "text", text: "follow up" }])],
        enqueuePendingTail: async () => true,
        rehydrate: async () => null,
        applyMessages,
        resumeStream: vi.fn<() => void>(),
      })
    ).toBe(true);
    expect(applyMessages).toHaveBeenCalledWith([prior]);
  });

  it("uses the same admission fallback when hydration rejects", async () => {
    const prior: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [],
    };
    const applyMessages = vi.fn<(messages: UIMessage[]) => void>();
    expect(
      await StreamRecovery.run({
        kind: "human-input-pending",
        messages: [prior, user("u1", [{ type: "text", text: "follow up" }])],
        enqueuePendingTail: async () => true,
        rehydrate: async () => {
          throw new Error("transient hydration failure");
        },
        applyMessages,
        resumeStream: vi.fn<() => void>(),
      })
    ).toBe(true);
    expect(applyMessages).toHaveBeenCalledWith([prior]);
  });

  it("does not propagate a failed stream reattachment", async () => {
    const restored: UIMessage[] = [{ id: "a1", role: "assistant", parts: [] }];
    const applyMessages = vi.fn<(messages: UIMessage[]) => void>();
    expect(
      await StreamRecovery.run({
        kind: "disconnect",
        messages: [],
        rehydrate: async () => restored,
        applyMessages,
        resumeStream: async () => {
          throw new Error("stream unavailable");
        },
      })
    ).toBe(false);
    expect(applyMessages).toHaveBeenCalledWith(restored);
  });

  it("keeps a durably queued tail recovered when reattachment fails", async () => {
    const restored: UIMessage[] = [{ id: "a1", role: "assistant", parts: [] }];
    expect(
      await StreamRecovery.run({
        kind: "run-in-flight",
        messages: [user("u1", [{ type: "text", text: "follow up" }])],
        enqueuePendingTail: async () => true,
        rehydrate: async () => restored,
        applyMessages: vi.fn<(messages: UIMessage[]) => void>(),
        resumeStream: async () => {
          throw new Error("stream unavailable");
        },
      })
    ).toBe(true);
  });

  it("does not claim a disconnect recovery when hydration fails", async () => {
    expect(
      await StreamRecovery.run({
        kind: "disconnect",
        messages: [],
        rehydrate: async () => null,
        applyMessages: vi.fn<(messages: UIMessage[]) => void>(),
        resumeStream: vi.fn<() => void>(),
      })
    ).toBe(false);
  });
});
