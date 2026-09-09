import { CatalogFixture } from "./catalog-fixture";
// GRIDA-SEC-004 — public 3D credential snapshots, bounded async lifecycle and safe failures.
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderHttp, ThreeDClient } from "./index";

const MODEL = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
const SELECTION = { model_id: MODEL, provider: "fal" } as const;
const STATUS = "https://queue.fal.run/requests/synthetic/status";
const RESULT = "https://queue.fal.run/requests/synthetic";
const ASSET = "https://v3.fal.media/synthetic.glb";
const KEY = "synthetic-private-fal-key";
const PROMPT = "synthetic-private-mesh-prompt";
const GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
type Stage = "key" | "submit" | "poll" | "result" | "download";

function stageOf(
  input: Parameters<typeof fetch>[0]
): Exclude<Stage, "key" | "download"> {
  if (String(input) === STATUS) return "poll";
  if (String(input) === RESULT) return "result";
  expect(String(input)).toBe(`https://queue.fal.run/${MODEL}`);
  return "submit";
}
function response(stage: Exclude<Stage, "key">): Response {
  switch (stage) {
    case "submit":
      return Response.json({ status_url: STATUS, response_url: RESULT });
    case "poll":
      return Response.json({ status: "COMPLETED" });
    case "result":
      return Response.json({ model_glb: { url: ASSET } });
    case "download":
      return new Response(GLB);
  }
}
function setup() {
  const get = vi.fn<ThreeDClient.Keys["get"]>(() => KEY);
  const request = vi.fn<typeof fetch>(async (input) =>
    response(stageOf(input))
  );
  const download = vi.fn<typeof fetch>(async () => response("download"));
  const client = new ThreeDClient({
    catalog: CatalogFixture.store(),
    keys: { get },
    http: new ProviderHttp({ request, download }),
  });
  return { client, get, request, download };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function failure(
  promise: Promise<unknown>,
  code: ThreeDClient.FailureCode
) {
  const error: unknown = await promise.catch((value: unknown) => value);
  expect(error).toBeInstanceOf(ThreeDClient.Failure);
  expect(error).toMatchObject({ code, message: code });
  expect(JSON.parse(JSON.stringify(error))).toEqual({ code, message: code });
  expect(error).not.toHaveProperty("cause");
  for (const value of [KEY, PROMPT, "upstream-body"])
    expect(
      `${error} ${JSON.stringify(error)} ${(error as Error).stack}`
    ).not.toContain(value);
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ThreeDClient invocation lifecycle", () => {
  it("uses one key for submit, repeated polls and result, then rereads rotation or removal", async () => {
    vi.useFakeTimers();
    const { client, get, request, download } = setup();
    let current: string | null = KEY;
    let polls = 0;
    get.mockImplementation(() => current);
    request.mockImplementation(async (input) => {
      const stage = stageOf(input);
      if (stage === "submit") current = "synthetic-rotated-fal-key";
      if (stage === "poll" && ++polls <= 2)
        return Response.json({
          status: polls === 1 ? "IN_QUEUE" : "IN_PROGRESS",
        });
      return response(stage);
    });
    const operation = await client.resolve(SELECTION);
    const generated = operation.generate({ prompt: PROMPT });
    await vi.advanceTimersByTimeAsync(4000);
    expect(await generated).toEqual({
      glb: { data: GLB, media_type: "model/gltf-binary" },
    });
    expect(get.mock.calls).toEqual([["fal"], ["fal"]]);
    expect(
      request.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("authorization")
      )
    ).toEqual(Array(5).fill(`Key ${KEY}`));
    expect(
      new Headers(download.mock.calls[0][1]?.headers).has("authorization")
    ).toBe(false);
    expect(new Headers(download.mock.calls[0][1]?.headers).has("cookie")).toBe(
      false
    );
    expect(String(download.mock.calls[0][0])).toBe(ASSET);
    await operation.generate({ prompt: PROMPT });
    expect(
      new Headers(request.mock.calls[5][1]?.headers).get("authorization")
    ).toBe(`Key ${current}`);
    expect(get).toHaveBeenCalledTimes(3);
    current = null;
    await failure(
      operation.generate({ prompt: PROMPT }),
      "provider_key_required"
    );
    expect(request).toHaveBeenCalledTimes(8);
    expect(download).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["key", "submit", "poll", "result", "download"] as const)(
    "aborts an uncooperative %s capability and refuses its late continuation",
    async (stage) => {
      const fixture = setup();
      const { client, get, request, download } = fixture;
      const operation = await client.resolve(SELECTION);
      const started = deferred<void>();
      const pendingKey = deferred<string>();
      const pendingResponse = deferred<Response>();
      if (stage === "key")
        get.mockImplementation(() => {
          started.resolve();
          return pendingKey.promise;
        });
      else if (stage === "download")
        download.mockImplementation(() => {
          started.resolve();
          return pendingResponse.promise;
        });
      else
        request.mockImplementation((input) => {
          if (stageOf(input) === stage) {
            started.resolve();
            return pendingResponse.promise;
          }
          return Promise.resolve(response(stageOf(input)));
        });
      const controller = new AbortController();
      const checked = failure(
        operation.generate({ prompt: PROMPT, signal: controller.signal }),
        "aborted"
      );
      await started.promise;
      const requestsAtAbort = request.mock.calls.length;
      const downloadsAtAbort = download.mock.calls.length;
      controller.abort();
      await checked;
      const cancel = vi.fn<() => void>();
      if (stage === "key") pendingKey.resolve(KEY);
      else
        pendingResponse.resolve(new Response(new ReadableStream({ cancel })));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledTimes(requestsAtAbort);
      expect(download).toHaveBeenCalledTimes(downloadsAtAbort);
      expect(requestsAtAbort).toBe(
        { key: 0, submit: 1, poll: 2, result: 3, download: 3 }[stage]
      );
      expect(downloadsAtAbort).toBe(stage === "download" ? 1 : 0);
      expect(cancel).toHaveBeenCalledTimes(stage === "key" ? 0 : 1);
    }
  );

  it("shares a ten-minute deadline across key, submit, poll, result and download awaits", async () => {
    vi.useFakeTimers();
    const { client, get, request, download } = setup();
    const operation = await client.resolve(SELECTION);
    const key = deferred<string>();
    const submit = deferred<Response>();
    const poll = deferred<Response>();
    const result = deferred<Response>();
    const asset = deferred<Response>();
    get.mockReturnValue(key.promise);
    request
      .mockReturnValueOnce(submit.promise)
      .mockReturnValueOnce(poll.promise)
      .mockReturnValueOnce(result.promise);
    download.mockReturnValue(asset.promise);
    const checked = failure(operation.generate({ prompt: PROMPT }), "timeout");
    await vi.advanceTimersByTimeAsync(100_000);
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(100_000);
    expect(request).toHaveBeenCalledOnce();
    submit.resolve(response("submit"));
    await vi.advanceTimersByTimeAsync(100_000);
    expect(request).toHaveBeenCalledTimes(2);
    poll.resolve(response("poll"));
    await vi.advanceTimersByTimeAsync(100_000);
    expect(request).toHaveBeenCalledTimes(3);
    result.resolve(response("result"));
    await vi.advanceTimersByTimeAsync(199_999);
    expect(download).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await checked;
    const cancel = vi.fn<() => void>();
    asset.resolve(new Response(new ReadableStream({ cancel })));
    await vi.advanceTimersByTimeAsync(1);
    expect(cancel).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
    expect(download).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not submit after a generation key lookup outlives its ten-minute deadline", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const operation = await client.resolve(SELECTION);
    const key = deferred<string>();
    get.mockReturnValue(key.promise);
    let settled = false;
    const checked = failure(
      operation.generate({ prompt: PROMPT }),
      "timeout"
    ).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(300_000);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds a separate resolve lookup to five minutes without accepting a late selection", async () => {
    vi.useFakeTimers();
    const { client, get, request } = setup();
    const key = deferred<string>();
    get.mockReturnValue(key.promise);
    const checked = failure(client.resolve(SELECTION), "timeout");
    await vi.advanceTimersByTimeAsync(300_000);
    await checked;
    key.resolve(KEY);
    await vi.advanceTimersByTimeAsync(1);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks the monotonic deadline before submitting after blocking key work", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve(SELECTION);
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    get.mockImplementation(() => {
      now = 600_001;
      return KEY;
    });
    await failure(operation.generate({ prompt: PROMPT }), "timeout");
    expect(request).not.toHaveBeenCalled();
  });

  it("cancels a polling delay without starting another status or result request", async () => {
    vi.useFakeTimers();
    const { client, request, download } = setup();
    const operation = await client.resolve(SELECTION);
    request.mockImplementation(async (input) =>
      stageOf(input) === "poll"
        ? Response.json({ status: "IN_PROGRESS" })
        : response(stageOf(input))
    );
    const controller = new AbortController();
    const checked = failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledTimes(2);
    controller.abort();
    await checked;
    await vi.advanceTimersByTimeAsync(600_000);
    expect(request).toHaveBeenCalledTimes(2);
    expect(download).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["result", "download"] as const)(
    "cancels and unlocks a stalled %s body without awaiting the host's cancel promise",
    async (stage) => {
      const { client, request, download } = setup();
      const operation = await client.resolve(SELECTION);
      const started = deferred<void>();
      const cancel = vi.fn<() => Promise<void>>(() => new Promise(() => {}));
      const body = new ReadableStream<Uint8Array>({
        pull() {
          started.resolve();
        },
        cancel,
      });
      if (stage === "download") download.mockResolvedValue(new Response(body));
      else
        request.mockImplementation(async (input) =>
          stageOf(input) === "result"
            ? new Response(body)
            : response(stageOf(input))
        );
      const controller = new AbortController();
      const checked = failure(
        operation.generate({ prompt: PROMPT, signal: controller.signal }),
        "aborted"
      );
      await started.promise;
      await vi.waitFor(() => expect(body.locked).toBe(true));
      controller.abort();
      await checked;
      expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
      expect(request).toHaveBeenCalledTimes(3);
      expect(download).toHaveBeenCalledTimes(stage === "download" ? 1 : 0);
    }
  );

  it.each(["key", "submit", "poll", "result", "download"] as const)(
    "contains a failing %s capability without retry or private error output",
    async (stage) => {
      const { client, get, request, download } = setup();
      const operation = await client.resolve(SELECTION);
      const fail = () => {
        throw Object.assign(new Error(`${KEY} ${PROMPT} upstream-body`), {
          responseBody: KEY,
        });
      };
      if (stage === "key") get.mockImplementation(fail);
      else if (stage === "download") download.mockImplementation(fail);
      else
        request.mockImplementation(async (input) => {
          if (stageOf(input) === stage) fail();
          return response(stageOf(input));
        });
      await failure(
        operation.generate({ prompt: PROMPT }),
        "generation_failed"
      );
      expect(request).toHaveBeenCalledTimes(
        { key: 0, submit: 1, poll: 2, result: 3, download: 3 }[stage]
      );
      expect(download).toHaveBeenCalledTimes(stage === "download" ? 1 : 0);
    }
  );

  it.each(["key", "submit"] as const)(
    "observes rejection when the %s capability aborts synchronously",
    async (stage) => {
      const { client, get, request } = setup();
      const operation = await client.resolve(SELECTION);
      const controller = new AbortController();
      const reject = () => {
        controller.abort();
        return Promise.reject(new Error(KEY));
      };
      if (stage === "key") get.mockImplementation(reject);
      else request.mockImplementation(reject);
      await failure(
        operation.generate({ prompt: PROMPT, signal: controller.signal }),
        "aborted"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(request).toHaveBeenCalledTimes(stage === "key" ? 0 : 1);
    }
  );

  it("refuses a pre-aborted generation before reading its credential", async () => {
    const { client, get, request } = setup();
    const operation = await client.resolve(SELECTION);
    const controller = new AbortController();
    controller.abort();
    await failure(
      operation.generate({ prompt: PROMPT, signal: controller.signal }),
      "aborted"
    );
    expect(get).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });
});
