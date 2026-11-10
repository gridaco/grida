import { expect, it, vi } from "vitest";
import { NativeImageGeneration } from "./native-image-generation";

const endpoint = "https://ai-gateway.vercel.sh/v1";
const model = "openai/gpt-image-2.5-flare";
const id = "7ccb8e68-a201-40d9-a793-44de9e6c6fc6";
const credential = { nonce: id.replaceAll("-", ""), proof: "a".repeat(64) };
const call = { sessionId: "chat", callId: id, prompt: "An image", credential };
const item = {
  id,
  file_name: "image-1.png",
  media_type: "image/png",
  byte_size: 123,
  created_at: 1,
};

it("keeps the captured provider and background, returning only a validated receipt", async () => {
  const request = vi.fn<(init: RequestInit) => Promise<Response>>(async () =>
    Response.json({
      model_id: model,
      provider_id: "vercel",
      stored_media: item,
    })
  );
  const owner = NativeImageGeneration.forByok("vercel", endpoint, request)!;
  expect(await owner.generate(1, { ...call, provider: "gg" })).toEqual({
    kind: "unavailable",
  });
  expect(
    await owner.generate(1, { ...call, prompt: "é".repeat(4097) })
  ).toEqual({ kind: "unavailable" });
  expect(request).not.toHaveBeenCalled();
  expect(
    await owner.generate(1, { ...call, background: "transparent" })
  ).toEqual({
    kind: "retained",
    id,
    mediaType: "image/png",
    bytes: 123,
  });
  const [init] = request.mock.calls[0];
  expect(new Headers(init.headers).get("accept")).toBe(
    "application/vnd.grida.retained-image+json"
  );
  expect(JSON.parse(String(init.body))).toEqual({
    model_id: model,
    binding_id: model,
    provider: "vercel",
    prompt: call.prompt,
    n: 1,
    credential,
    background: "transparent",
  });
  expect(await owner.generate(2, call)).toEqual({ kind: "uncertain" });
  expect(request).toHaveBeenCalledOnce();
});

it("distinguishes generation without persistence from a missing or mismatched reply", async () => {
  const request = vi.fn<(init: RequestInit) => Promise<Response>>();
  request
    .mockResolvedValueOnce(
      Response.json({
        model_id: model,
        provider_id: "vercel",
        stored_media: null,
      })
    )
    .mockResolvedValueOnce(
      Response.json({ model_id: model, provider_id: "gg", stored_media: item })
    )
    .mockResolvedValueOnce(new Response("x".repeat(16 * 1024 + 1)));
  const owner = NativeImageGeneration.forByok("vercel", endpoint, request)!;
  expect(await owner.generate(1, call)).toEqual({
    kind: "generated_unretained",
  });
  expect(
    await owner.generate(2, { ...call, callId: "wrong-provider" })
  ).toEqual({ kind: "uncertain" });
  expect(await owner.generate(3, { ...call, callId: "too-large" })).toEqual({
    kind: "uncertain",
  });
  expect(request).toHaveBeenCalledTimes(3);
});

it("only cancels the current exact request and aborts it on owner close", async () => {
  const request = vi.fn<(init: RequestInit) => Promise<Response>>(
    ({ signal }) =>
      new Promise<Response>((_, reject) => {
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        });
      })
  );
  const owner = NativeImageGeneration.forByok("vercel", endpoint, request)!;
  const first = owner.generate(1, call);
  const firstSignal = request.mock.calls[0][0].signal;
  owner.cancel("1");
  expect(firstSignal?.aborted).toBe(false);
  expect(await owner.generate(2, { ...call, callId: "concurrent" })).toEqual({
    kind: "unavailable",
  });
  owner.cancel(1);
  expect(await first).toEqual({ kind: "uncertain" });
  const next = owner.generate(2, { ...call, callId: "next" });
  owner.close();
  expect(await next).toEqual({ kind: "uncertain" });
  expect(await owner.generate(3, { ...call, callId: "closed" })).toEqual({
    kind: "unavailable",
  });
  expect(request).toHaveBeenCalledTimes(2);
});
