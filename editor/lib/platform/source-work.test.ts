import { describe, expect, it, vi } from "vitest";
import { SourceWork, type SourceWorkRPC } from "./source-work";
const context = {
  organizationId: 7,
  feature: "ai.text",
  model_id: "model",
  transactionId: "retained-execution",
};
function fixture() {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const rpc = vi.fn<SourceWorkRPC>(async (name, args) => {
    calls.push({ name, args });
    return {
      data:
        name === "platform_source_work_begin"
          ? { created: true, id: args.work_id }
          : { accepted: true },
      error: null,
    };
  });
  return { calls, rpc, work: new SourceWork(rpc) };
}
describe("source work custody", () => {
  it("denies a cached SDK before network dispatch when maintenance rejects admission", async () => {
    const f = fixture(),
      transport = vi.fn<typeof fetch>();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    await expect(
      f.work.fetch(
        "https://api.stripe.com/v1/customers",
        { method: "POST", body: "name=test" },
        transport
      )
    ).rejects.toThrow("billing_unavailable");
    expect(transport).not.toHaveBeenCalled();
  });
  it("retains exact private request and response before exposing a provider response", async () => {
    const f = fixture();
    const response = await f.work.fetch(
      "https://api.stripe.com/v1/customers",
      {
        method: "POST",
        headers: {
          authorization: "Bearer never-persist",
          cookie: "never-persist",
          "idempotency-key": "permanent-key",
        },
        body: "name=hello%20world",
      },
      async () =>
        new Response('{"id":"cus_retained"}', {
          headers: { "request-id": "req_provider" },
        })
    );
    expect(await response.json()).toEqual({ id: "cus_retained" });
    expect(f.calls.map((c) => c.name)).toEqual([
      "platform_source_work_begin",
      "platform_source_work_capture",
    ]);
    const request = f.calls[0].args.request as Record<string, unknown>,
      evidence = f.calls[1].args.evidence as Record<string, unknown>;
    expect(request.idempotency_key).toBe("permanent-key");
    expect(
      Buffer.from(request.body_base64 as string, "base64").toString()
    ).toBe("name=hello%20world");
    expect(
      Buffer.from(evidence.body_base64 as string, "base64").toString()
    ).toBe('{"id":"cus_retained"}');
    expect(evidence.request_id).toBe("req_provider");
    expect(JSON.stringify(f.calls)).not.toContain("never-persist");
    expect(f.calls[1].args.work_id).toBe(f.calls[0].args.work_id);
  });
  it("never certifies an ambiguous transport failure or retries it", async () => {
    const f = fixture(),
      transport = vi.fn<typeof fetch>(async () => {
        throw new Error("lost response");
      });
    await expect(
      f.work.fetch(
        "https://api.metronome.com/v1/ingest",
        { method: "POST", body: "{}" },
        transport
      )
    ).rejects.toThrow("lost response");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(f.calls.map((c) => c.name)).toEqual(["platform_source_work_begin"]);
  });
  it("rejects a mismatched admission response before dispatch", async () => {
    const f = fixture();
    f.rpc.mockResolvedValueOnce({
      data: { created: true, id: "ignored" },
      error: null,
    });
    // A mismatched admission response itself cannot authorize dispatch.
    const transport = vi.fn<typeof fetch>();
    await expect(
      f.work.fetch("https://api.stripe.com", {}, transport)
    ).rejects.toThrow("execution_already_dispatched");
    expect(transport).not.toHaveBeenCalled();
  });
  it("retains an unresolved attempt when successful HTTP custody cannot commit", async () => {
    const f = fixture();
    f.rpc.mockImplementationOnce(async (_name, args) => ({
      data: { created: true, id: args.work_id },
      error: null,
    }));
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });
    const transport = vi.fn<typeof fetch>(async () =>
      Response.json({ id: "cus_original" })
    );
    await expect(
      f.work.fetch(
        "https://api.stripe.com/v1/customers",
        { method: "POST", body: "name=test" },
        transport
      )
    ).rejects.toThrow("billing_unavailable");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(f.rpc.mock.calls.map((c) => c[0])).toEqual([
      "platform_source_work_begin",
      "platform_source_work_capture",
    ]);
  });
  it("commits exact usage before ingest, and scopes admitted completion HTTP to its parent", async () => {
    const f = fixture(),
      w = await f.work.beginAI(context);
    await expect(
      f.work.completeAI(
        w,
        0.000000000000000001,
        { result: "private body" },
        async () => {
          expect(f.calls[1].name).toBe("platform_source_work_capture");
          await f.work.fetch(
            "https://api.metronome.com/v1/ingest",
            { method: "POST", body: "{}" },
            async () => Response.json({ accepted: true })
          );
        }
      )
    ).resolves.toEqual({ delivered: true });
    expect((f.calls[1].args.evidence as Record<string, unknown>).quantity).toBe(
      "0.000000000000000001"
    );
    expect(JSON.stringify(f.calls[1])).not.toContain("private body");
    expect(f.calls[2].args.parent_work_id).toBe(w.id);
    expect(f.calls.at(-1)?.name).toBe("platform_source_work_finish");
  });
  it("retains failed legacy usage delivery without claiming completion or erasing paid results", async () => {
    const f = fixture(),
      w = await f.work.beginAI(context),
      deliver = vi.fn<() => Promise<void>>(async () => {
        throw new Error("lost ingest ACK");
      });
    await expect(
      f.work.completeAI(w, 1.125, { tokens: 1 }, deliver)
    ).resolves.toEqual({ delivered: false });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(f.calls.map((c) => c.name)).toEqual([
      "platform_source_work_begin",
      "platform_source_work_capture",
    ]);
  });
  it("refuses delivery if local completion custody fails", async () => {
    const f = fixture(),
      w = await f.work.beginAI(context),
      deliver = vi.fn<() => Promise<void>>();
    f.rpc.mockResolvedValueOnce({ data: null, error: { code: "unavailable" } });
    await expect(f.work.completeAI(w, 10, {}, deliver)).rejects.toThrow(
      "billing_unavailable"
    );
    expect(deliver).not.toHaveBeenCalled();
  });
});
