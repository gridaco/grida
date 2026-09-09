// GRIDA-SEC-004 / GRIDA-SEC-006 — isolated public music operation, fixed scoped authority.
// GRIDA-GG: provider — synthetic MP3 prefix bytes, no provider or account access.
import assert from "node:assert/strict";

export async function proveMusic({ load, require, check, catalog }) {
  const { MusicClient, ProviderHttp, GridaGatewaySessionStore } =
    await load("@grida/ai");
  const model = "google/lyria-3";
  const prompt = "A synthetic melody";
  const data = new Uint8Array([0x49, 0x44, 0x33]);
  const base64 = "SUQz";
  const initialToken = "synthetic-music-gg-no-authority";
  const rotatedToken = "synthetic-rotated-music-gg-no-authority";
  let token = initialToken;
  let mode = "success";
  let downloads = 0;
  let cancelledBodies = 0;
  let resolvePending;
  let started;
  const requests = [];
  const gg = new GridaGatewaySessionStore();
  const grant = () =>
    gg.set({ access_token: token, expires_at: Date.now() + 120_000 });
  grant();
  const http = new ProviderHttp({
    request: async (input, init) => {
      const request = new Request(input, init);
      assert.equal(
        request.url,
        "https://gg.example.invalid/api/v1/ai/music/generations"
      );
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("authorization"), `Bearer ${token}`);
      assert.equal(request.headers.get("cookie"), null);
      const body = await request.json();
      requests.push(body);
      assert.deepEqual(Object.keys(body).sort(), [
        "model_id",
        "prompt",
        "seed",
      ]);
      assert.equal(body.prompt, prompt);
      assert.equal(body.seed, 0);
      if (mode === "throw") throw new Error(`${token} ${prompt} upstream-body`);
      if (mode === "401" || mode === "402")
        return new Response(`${token} upstream-body`, { status: Number(mode) });
      if (mode === "pending")
        return new Promise((resolve) => {
          resolvePending = resolve;
          started();
        });
      if (mode === "oversized")
        return new Response(
          new ReadableStream({
            cancel() {
              cancelledBodies++;
            },
          }),
          { headers: { "content-length": String(64 * 1024 * 1024) } }
        );
      return Response.json({
        model_id: mode === "wrong_model" ? "unrequested/model" : body.model_id,
        provider_id: "gg",
        audio: {
          base64,
          media_type: "audio/mpeg",
          file_name: "upstream-name.mp3",
          private_metadata: token,
        },
        stored_media: { private_metadata: token },
        url: "https://untrusted.example.invalid/music.mp3",
      });
    },
    download: async () => {
      downloads++;
      throw new Error("Music cannot grant a download destination");
    },
  });
  const client = new MusicClient({
    catalog,
    http,
    gg,
    gg_base_url: "https://gg.example.invalid",
  });
  const failure = (code) => (error) => {
    assert(error instanceof MusicClient.Failure);
    assert.deepEqual(error.toJSON(), { code, message: code });
    assert.equal(error.cause, undefined);
    const exposed = `${error} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [initialToken, rotatedToken, prompt, "upstream-body"])
      assert(!exposed.includes(value));
    return true;
  };
  const generated = (result) => {
    assert.deepEqual(result, { audio: { data, media_type: "audio/mpeg" } });
    assert.equal(result.audio.data.constructor, Uint8Array);
  };
  await check(
    "music implementation and shared request lifecycle remain private",
    async () => {
      for (const name of ["music-client", "media-request"])
        assert.throws(() => require.resolve(`@grida/ai/${name}`));
      assert.deepEqual(Object.keys(client), []);
    }
  );
  for (const model_id of [model, "google/lyria-3-pro"]) {
    await check(`${model_id} music through scoped GG transport`, async () => {
      const before = requests.length;
      const operation = await client.resolve({ model_id, provider: "gg" });
      assert.equal(requests.length, before);
      assert.equal(operation.model_id, model_id);
      assert.equal(operation.provider_id, "gg");
      assert(Object.isFrozen(operation));
      assert(!JSON.stringify(operation).includes(token));
      generated(await operation.generate({ prompt: `  ${prompt}  `, seed: 0 }));
      assert.equal(requests.length, before + 1);
    });
  }
  await check(
    "music refuses unsupported routes and inputs before submission",
    async () => {
      const before = requests.length;
      await assert.rejects(
        client.resolve({ model_id: model, provider: "replicate" }),
        failure("invalid_input")
      );
      await assert.rejects(
        client.resolve({ model_id: "eleven_text_to_sound_v2", provider: "gg" }),
        failure("model_unavailable")
      );
      const operation = await client.resolve({
        model_id: model,
        provider: "gg",
      });
      for (const input of [
        { prompt: " " },
        { prompt: "🎵".repeat(2049) },
        { prompt, seed: 0.5 },
        { prompt, images: [] },
      ]) {
        await assert.rejects(
          operation.generate(input),
          failure("invalid_input")
        );
      }
      assert.equal(requests.length, before);
    }
  );
  await check(
    "music uses rotated scoped authority and clear blocks reuse",
    async () => {
      const operation = await client.resolve({
        model_id: model,
        provider: "gg",
      });
      token = rotatedToken;
      grant();
      generated(await operation.generate({ prompt, seed: 0 }));
      gg.clear();
      const before = requests.length;
      await assert.rejects(
        operation.generate({ prompt, seed: 0 }),
        failure("gg_token_expired")
      );
      assert.equal(requests.length, before);
      grant();
    }
  );
  for (const [next, code] of [
    ["401", "gg_token_expired"],
    ["402", "insufficient_credits"],
    ["throw", "generation_failed"],
    ["wrong_model", "invalid_response"],
    ["oversized", "invalid_response"],
  ]) {
    await check(
      `music ${next} response stays safe with one submission`,
      async () => {
        const operation = await client.resolve({
          model_id: model,
          provider: "gg",
        });
        const before = requests.length;
        mode = next;
        try {
          await assert.rejects(
            operation.generate({ prompt, seed: 0 }),
            failure(code)
          );
        } finally {
          mode = "success";
        }
        assert.equal(requests.length, before + 1);
      }
    );
  }
  await check(
    "aborted music cancels a late response without resubmission",
    async () => {
      const operation = await client.resolve({
        model_id: model,
        provider: "gg",
      });
      const controller = new AbortController();
      const submitted = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      const beforeCancelled = cancelledBodies;
      mode = "pending";
      try {
        const checked = assert.rejects(
          operation.generate({ prompt, seed: 0, signal: controller.signal }),
          failure("aborted")
        );
        await submitted;
        controller.abort();
        await checked;
        resolvePending(
          new Response(
            new ReadableStream({
              cancel() {
                cancelledBodies++;
              },
            })
          )
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(cancelledBodies, beforeCancelled + 1);
        assert.equal(requests.length, before + 1);
      } finally {
        mode = "success";
      }
    }
  );
  assert.equal(downloads, 0);
  assert.equal(cancelledBodies, 2);
  return {
    requests: requests.length,
    downloads,
    cancelled_bodies: cancelledBodies,
  };
}
