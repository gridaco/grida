// GRIDA-SEC-004 — bounded provider error bodies release their streams.
import { describe, expect, it, vi } from "vitest";
import { delay, safeText } from "./fetch-helpers";

describe("poll delay cleanup", () => {
  it("removes completed waits and settles an already-aborted wait", async () => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await delay(0, controller.signal);
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
    controller.abort();
    await expect(delay(10_000, controller.signal)).rejects.toThrow(
      "The operation was aborted."
    );
    expect(remove).toHaveBeenCalledTimes(2);
  });
});

describe("safeText", () => {
  it("returns a short error body", async () => {
    await expect(safeText(new Response("provider unavailable"))).resolves.toBe(
      "provider unavailable"
    );
  });

  it("cancels a chunked error body after a bounded prefix", async () => {
    const cancel = vi.fn<(reason?: unknown) => void>();
    let pulls = 0;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(1_024).fill(0x61));
        },
        cancel,
      }),
      { status: 502 }
    );

    const text = await safeText(response);

    expect(text).toHaveLength(500);
    expect(text).toMatch(/^a+$/);
    expect(pulls).toBeLessThanOrEqual(5);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not surface stream failures", async () => {
    const response = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error("stream failed"));
        },
      }),
      { status: 502 }
    );

    await expect(safeText(response)).resolves.toBe("<unreadable>");
  });
});
