// GRIDA-SEC-004 / GRIDA-SEC-006 — a foreign host exercises only packed public exports.
// GRIDA-GG: provider — synthetic video bytes and memory-only scoped authority.
import assert from "node:assert/strict";

export async function proveVideo({ load, require, check, catalog }) {
  const { VideoClient, ProviderHttp, GridaGatewaySessionStore } =
    await load("@grida/ai");
  const { models } = await load("@grida/ai-models");
  const model = "google/veo-3.1";
  const prompt = "A synthetic video";
  const frame = "https://assets.example.invalid/frame.png";
  const key = "synthetic-video-key-no-authority";
  const token = "synthetic-video-gg-no-authority";
  const data = new Uint8Array([0, 0, 0, 24]);
  const base64 = "AAAAGA==";
  const requests = [];
  const downloads = [];
  let fail = false;
  const gg = new GridaGatewaySessionStore();
  gg.set({ access_token: token, expires_at: Date.now() + 120_000 });
  const http = new ProviderHttp({
    request: async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      const authorization = request.headers.get("authorization");
      requests.push({ url: request.url, method: request.method });
      if (fail) throw new Error(`${key} ${token} ${prompt} upstream-body`);
      const body = request.method === "POST" ? await request.json() : undefined;
      if (body) assert.equal(body.prompt, prompt);
      if (url.origin === "https://openrouter.ai") {
        assert.equal(authorization, `Bearer ${key}`);
        if (request.method === "POST") {
          assert.equal(url.pathname, "/api/v1/videos");
          assert.equal(
            body.model,
            models.video.models[model].providers.openrouter.id
          );
          assert.deepEqual(body.frame_images, [
            {
              type: "image_url",
              image_url: { url: frame },
              frame_type: "first_frame",
            },
          ]);
          return Response.json({ id: "job/a" });
        }
        if (url.pathname.endsWith("/content")) {
          assert.equal(url.pathname, "/api/v1/videos/job%2Fa/content");
          assert.equal(url.search, "?index=0");
          return new Response(data, {
            headers: { "content-type": "video/mp4" },
          });
        }
        assert.equal(url.pathname, "/api/v1/videos/job%2Fa");
        return Response.json({
          status: "completed",
          unsigned_urls: ["https://untrusted.example.invalid/video.mp4"],
        });
      }
      if (url.origin === "https://ai-gateway.vercel.sh") {
        assert.equal(url.pathname, "/v3/ai/video-model");
        assert.equal(authorization, `Bearer ${key}`);
        assert.equal(body.n, 1);
        assert.deepEqual(body.image, { type: "url", url: frame });
        return new Response(
          `data: ${JSON.stringify({ type: "result", videos: [{ type: "base64", data: base64, mediaType: "video/mp4" }], warnings: [] })}\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        );
      }
      if (url.origin === "https://queue.fal.run") {
        assert.equal(authorization, `Key ${key}`);
        if (request.method === "POST") {
          assert.equal(
            url.pathname,
            `/${models.video.models[model].providers.fal.id}`
          );
          assert.equal(body.image_url, frame);
          return Response.json({
            status_url: "https://queue.fal.run/job/status",
            response_url: "https://queue.fal.run/job/result",
          });
        }
        if (url.pathname === "/job/status")
          return Response.json({ status: "COMPLETED" });
        assert.equal(url.pathname, "/job/result");
        return Response.json({
          video: {
            url: "https://v3.fal.media/video.mp4",
            content_type: "video/mp4",
          },
        });
      }
      assert.equal(url.origin, "https://gg.example.invalid");
      assert.equal(url.pathname, "/api/v1/ai/videos/generations");
      assert.equal(authorization, `Bearer ${token}`);
      assert.equal(body.model_id, model);
      assert.equal(body.image_url, undefined);
      return Response.json({ videos: [{ base64, media_type: "video/mp4" }] });
    },
    download: async (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.url, "https://v3.fal.media/video.mp4");
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.headers.get("cookie"), null);
      downloads.push(request.url);
      return new Response(data, { headers: { "content-type": "video/mp4" } });
    },
  });
  const client = new VideoClient({
    catalog,
    http,
    keys: { get: () => key },
    gg,
    gg_base_url: "https://gg.example.invalid",
  });
  const failure = (code) => (error) => {
    assert(error instanceof VideoClient.Failure);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.deepEqual(error.toJSON(), { code, message: code });
    const exposed = `${error} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [key, token, prompt, "upstream-body"])
      assert(!exposed.includes(value));
    return true;
  };
  await check("video adapters remain private", async () => {
    for (const name of ["video-models", "video-client", "video-request"])
      assert.throws(() => require.resolve(`@grida/ai/${name}`));
  });
  for (const provider of ["openrouter", "vercel", "fal", "gg"]) {
    await check(`${provider} video through explicit transport`, async () => {
      const before = requests.length;
      const operation = await client.resolve({
        model_id: model,
        provider,
        image: provider !== "gg",
      });
      assert.equal(requests.length, before);
      assert.equal(operation.provider_id, provider);
      assert.equal(operation.model_id, model);
      assert(Object.isFrozen(operation));
      assert(!JSON.stringify(operation).includes(key));
      const result = await operation.generate({
        prompt,
        ...(provider !== "gg" ? { image_url: frame } : {}),
      });
      assert.deepEqual(result, { videos: [{ data, media_type: "video/mp4" }] });
      assert.equal(result.videos[0].data.constructor, Uint8Array);
      assert.equal(
        requests.slice(before).filter((request) => request.method === "POST")
          .length,
        1
      );
    });
  }
  await check(
    "video input capability refuses unsupported modes before I/O",
    async () => {
      const before = requests.length;
      await assert.rejects(
        client.resolve({ model_id: model, provider: "fal" }),
        failure("input_unsupported")
      );
      await assert.rejects(
        client.resolve({ model_id: model, provider: "gg", image: true }),
        failure("input_unsupported")
      );
      const operation = await client.resolve({
        model_id: model,
        provider: "fal",
        image: true,
      });
      assert.equal(operation.input, "image");
      await assert.rejects(
        operation.generate({ prompt }),
        failure("invalid_input")
      );
      assert.equal(requests.length, before);
    }
  );
  await check(
    "video invocation rechecks the selected credential without fallback",
    async () => {
      let available = true;
      const selected = new VideoClient({
        catalog,
        http,
        keys: {
          get: (provider) => (provider === "vercel" && !available ? null : key),
        },
      });
      const operation = await selected.resolve({
        model_id: model,
        provider: "vercel",
      });
      available = false;
      const before = requests.length;
      await assert.rejects(
        operation.generate({ prompt }),
        failure("provider_unavailable")
      );
      assert.equal(requests.length, before);
    }
  );
  await check(
    "failed video submits once with a safe public failure",
    async () => {
      const operation = await client.resolve({
        model_id: model,
        provider: "vercel",
      });
      const before = requests.length;
      fail = true;
      try {
        await assert.rejects(
          operation.generate({ prompt }),
          failure("generation_failed")
        );
      } finally {
        fail = false;
      }
      assert.equal(requests.length, before + 1);
    }
  );
  await check("cleared video GG authority blocks operation reuse", async () => {
    const operation = await client.resolve({ model_id: model, provider: "gg" });
    gg.clear();
    const before = requests.length;
    await assert.rejects(
      operation.generate({ prompt }),
      failure("gg_token_expired")
    );
    assert.equal(requests.length, before);
  });
  await check(
    "video cancellation settles even if credential lookup ignores it",
    async () => {
      let pending = false;
      let resolveKey;
      const selected = new VideoClient({
        catalog,
        http,
        keys: {
          get: () =>
            pending
              ? new Promise((resolve) => {
                  resolveKey = resolve;
                })
              : key,
        },
      });
      const operation = await selected.resolve({
        model_id: model,
        provider: "vercel",
      });
      pending = true;
      const before = requests.length;
      const controller = new AbortController();
      const checked = assert.rejects(
        operation.generate({ prompt, signal: controller.signal }),
        failure("aborted")
      );
      controller.abort();
      await checked;
      resolveKey(key);
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(requests.length, before);
    }
  );
  assert.equal(downloads.length, 1);
  return { requests: requests.length, downloads: downloads.length };
}
