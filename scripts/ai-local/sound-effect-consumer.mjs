// GRIDA-SEC-004 — standalone SFX with explicit ElevenLabs authority and synthetic bytes.
import assert from "node:assert/strict";

export async function proveSoundEffects({ load, require, check }) {
  const { SoundEffectClient, ProviderHttp } = await load("@grida/ai");
  const model = "eleven_text_to_sound_v2";
  const selection = { model_id: model, provider: "elevenlabs" };
  const prompt = "A synthetic sound effect";
  const data = new Uint8Array([0x49, 0x44, 0x33]);
  const initialKey = "synthetic-elevenlabs-key-no-authority";
  const rotatedKey = "synthetic-rotated-elevenlabs-key-no-authority";
  let key = initialKey;
  let keyMode = "normal";
  let mode = "success";
  let expectedBody = { model_id: model, text: prompt };
  let keyReads = 0;
  let downloads = 0;
  let cancelledBodies = 0;
  let started;
  let resolvePending;
  const requests = [];
  const keys = {
    get(provider) {
      assert.equal(provider, "elevenlabs");
      keyReads++;
      if (keyMode === "throw")
        throw new Error(`${key} ${prompt} upstream-body`);
      if (keyMode === "pending")
        return new Promise((resolve) => {
          resolvePending = resolve;
          started();
        });
      return key;
    },
  };
  const http = new ProviderHttp({
    request: async (input, init) => {
      const request = new Request(input, init);
      assert.equal(
        request.url,
        "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128"
      );
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("xi-api-key"), key);
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.headers.get("cookie"), null);
      assert.equal(request.headers.get("content-type"), "application/json");
      assert.equal(request.headers.get("accept"), "audio/mpeg");
      const body = await request.json();
      requests.push(body);
      assert.deepEqual(body, expectedBody);
      if (mode === "throw") throw new Error(`${key} ${prompt} upstream-body`);
      if (mode === "401" || mode === "403")
        return new Response(`${key} upstream-body`, { status: Number(mode) });
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
          {
            headers: {
              "content-type": "audio/mpeg",
              "content-length": String(16 * 1024 * 1024 + 1),
            },
          }
        );
      return new Response(mode === "empty" ? new Uint8Array() : data, {
        headers: {
          "content-type":
            mode === "wrong_type" ? "audio/wav" : "Audio/MPEG; charset=binary",
          "x-provider-metadata": key,
          "content-disposition": `attachment; filename="${key}.mp3"`,
        },
      });
    },
    download: async () => {
      downloads++;
      throw new Error("Sound effects cannot grant a download destination");
    },
  });
  const client = new SoundEffectClient({ keys, http });
  const failure = (code) => (error) => {
    assert(error instanceof SoundEffectClient.Failure);
    assert.deepEqual(error.toJSON(), { code, message: code });
    assert.equal(error.cause, undefined);
    const exposed = `${error} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [initialKey, rotatedKey, prompt, "upstream-body"])
      assert(!exposed.includes(value));
    return true;
  };
  const generated = (result) => {
    assert.deepEqual(result, { audio: { data, media_type: "audio/mpeg" } });
    assert.equal(result.audio.data.constructor, Uint8Array);
  };
  await check(
    "sound-effect implementation remains private with no credential view",
    async () => {
      assert.throws(() => require.resolve("@grida/ai/sound-effect-client"));
      assert.throws(() => require.resolve("@grida/ai/media-request"));
      assert.deepEqual(Object.keys(client), []);
      assert.throws(
        () => new SoundEffectClient({ keys, http, gg: {} }),
        failure("invalid_input")
      );
    }
  );
  await check(
    "sound effects preserve the existing model and explicit false/zero options",
    async () => {
      const operation = await client.resolve(selection);
      assert.equal(requests.length, 0);
      assert.equal(operation.model_id, model);
      assert.equal(operation.binding_id, model);
      assert.equal(operation.provider_id, "elevenlabs");
      assert(Object.isFrozen(operation));
      assert(!JSON.stringify(operation).includes(key));
      expectedBody = {
        model_id: model,
        text: prompt,
        duration_seconds: 0.5,
        loop: false,
        prompt_influence: 0,
      };
      generated(
        await operation.generate({
          prompt: ` ${prompt} `,
          duration_seconds: 0.5,
          loop: false,
          prompt_influence: 0,
        })
      );
      assert.equal(requests.length, 1);
    }
  );
  await check(
    "sound effects leave omitted provider defaults absent",
    async () => {
      expectedBody = { model_id: model, text: prompt };
      generated(await (await client.resolve(selection)).generate({ prompt }));
    }
  );
  await check(
    "sound effects reject unsupported inputs and routes before submission",
    async () => {
      const before = requests.length;
      const beforeKeys = keyReads;
      await assert.rejects(
        client.resolve({ ...selection, provider: "gg" }),
        failure("invalid_input")
      );
      await assert.rejects(
        client.resolve({ ...selection, model_id: "eleven_v3" }),
        failure("model_unavailable")
      );
      assert.equal(keyReads, beforeKeys);
      const operation = await client.resolve(selection);
      const selectedKeys = keyReads;
      for (const input of [
        { prompt: " " },
        { prompt: "🔔".repeat(451) },
        { prompt, duration_seconds: 0.49 },
        { prompt, duration_seconds: 30.01 },
        { prompt, prompt_influence: NaN },
        { prompt, loop: null },
        { prompt, seed: 0 },
      ])
        await assert.rejects(
          operation.generate(input),
          failure("invalid_input")
        );
      assert.equal(keyReads, selectedKeys);
      assert.equal(requests.length, before);
    }
  );
  await check(
    "sound effects reread the selected key and removal blocks reuse",
    async () => {
      const operation = await client.resolve(selection);
      key = rotatedKey;
      generated(await operation.generate({ prompt }));
      key = null;
      const before = requests.length;
      await assert.rejects(
        operation.generate({ prompt }),
        failure("provider_key_required")
      );
      await assert.rejects(
        client.resolve(selection),
        failure("provider_key_required")
      );
      assert.equal(requests.length, before);
      key = rotatedKey;
    }
  );
  await check(
    "sound-effect key failures expose only safe codes without submission",
    async () => {
      const before = requests.length;
      keyMode = "throw";
      try {
        await assert.rejects(
          client.resolve(selection),
          failure("generation_failed")
        );
      } finally {
        keyMode = "normal";
      }
      assert.equal(requests.length, before);
    }
  );
  for (const [next, code] of [
    ["401", "generation_failed"],
    ["403", "generation_failed"],
    ["throw", "generation_failed"],
    ["wrong_type", "invalid_response"],
    ["empty", "invalid_response"],
    ["oversized", "invalid_response"],
  ])
    await check(
      `sound-effect ${next} response is safe and never resubmitted`,
      async () => {
        const operation = await client.resolve(selection);
        const before = requests.length;
        mode = next;
        try {
          await assert.rejects(operation.generate({ prompt }), failure(code));
        } finally {
          mode = "success";
        }
        assert.equal(requests.length, before + 1);
      }
    );
  await check(
    "aborted sound-effect key lookup cannot later submit a paid request",
    async () => {
      const operation = await client.resolve(selection);
      const controller = new AbortController();
      const pending = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      keyMode = "pending";
      try {
        const checked = assert.rejects(
          operation.generate({ prompt, signal: controller.signal }),
          failure("aborted")
        );
        await pending;
        controller.abort();
        await checked;
        resolvePending(key);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(requests.length, before);
      } finally {
        keyMode = "normal";
      }
    }
  );
  await check(
    "aborted sound effects cancel late response bodies without resubmission",
    async () => {
      const operation = await client.resolve(selection);
      const controller = new AbortController();
      const submitted = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      const beforeCancelled = cancelledBodies;
      mode = "pending";
      try {
        const checked = assert.rejects(
          operation.generate({ prompt, signal: controller.signal }),
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
