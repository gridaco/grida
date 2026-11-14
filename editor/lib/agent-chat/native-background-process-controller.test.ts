import { describe, expect, it, vi } from "vitest";
import type { NativeChatBackgroundProcess } from "@grida/desktop-bridge";
import { NativeBackgroundProcessController } from "./native-background-process-controller";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function controller() {
  const sent: {
    ids: readonly number[] | undefined;
    reply: ReturnType<typeof deferred>;
  }[] = [];
  const bridge = {
    acceptsBackgroundProcesses: async () => true,
    backgroundProcesses: vi.fn<
      () => Promise<readonly NativeChatBackgroundProcess[]>
    >(async () => []),
    stopBackgroundProcesses: vi.fn<
      (attachment: string, ids?: readonly number[]) => Promise<void>
    >((_attachment, ids) => {
      const reply = deferred();
      sent.push({ ids, reply });
      return reply.promise;
    }),
  };
  return {
    sent,
    processes: new NativeBackgroundProcessController(
      bridge as unknown as ConstructorParameters<
        typeof NativeBackgroundProcessController
      >[0],
      "attachment"
    ),
  };
}

describe("NativeBackgroundProcessController.stop", () => {
  it("stops a second process named while the first stop is pending", async () => {
    const { sent, processes } = controller();
    const first = processes.stop([1]);
    const second = processes.stop([2]);
    const third = processes.stop([3]);
    expect(sent.map(({ ids }) => ids)).toEqual([[1]]);
    expect(processes.read().stopping).toEqual([1, 2, 3]);

    sent[0].reply.resolve();
    expect(await first).toBe(true);
    // The requests made meanwhile go together, after the first.
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].ids).toEqual([2, 3]);
    expect(processes.read().stopping).toEqual([2, 3]);
    sent[1].reply.resolve();
    expect(await second).toBe(true);
    expect(await third).toBe(true);
    expect(processes.read().stopping).toBeNull();
  });

  it("shares a pending stop that already covers the request", async () => {
    const { sent, processes } = controller();
    const all = processes.stop();
    const one = processes.stop([4]);
    expect(one).toBe(all);
    sent[0].reply.resolve();
    expect(await one).toBe(true);
    expect(sent.map(({ ids }) => ids)).toEqual([undefined]);
  });

  it("stops everything after a narrower stop, whatever its outcome", async () => {
    const { sent, processes } = controller();
    const one = processes.stop([1]);
    const all = processes.stop();
    expect(processes.read().stopping).toBe("all");
    sent[0].reply.reject(new Error("native_agent_request_timeout"));
    expect(await one).toBe(false);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1].ids).toBeUndefined();
    sent[1].reply.resolve();
    expect(await all).toBe(true);
  });
});
