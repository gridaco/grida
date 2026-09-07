// GRIDA-SEC-004 — standalone speech/voice discovery with synthetic ElevenLabs authority.
import assert from "node:assert/strict";

export async function proveTextToSpeech({ load, require, check }) {
  const { TextToSpeechClient, ProviderHttp } = await load("@grida/ai");
  const selection = {
    model_id: "eleven_v3",
    provider: "elevenlabs",
    voice_id: " voice/id ",
  };
  const speechText = "  [whispers] Synthetic speech.\n ";
  const data = new Uint8Array([0x49, 0x44, 0x33]);
  const initialKey = "synthetic-speech-key-no-authority";
  const rotatedKey = "synthetic-rotated-speech-key-no-authority";
  const cursor = "page/+?& #";
  let key = initialKey;
  let expectedKey = initialKey;
  let keyMode = "normal";
  let mode = "success";
  let page = 0;
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
        throw new Error(`${key} ${speechText} upstream-body`);
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
      const url = new URL(request.url);
      const listing = request.method === "GET";
      assert.equal(url.origin, "https://api.elevenlabs.io");
      assert.equal(request.headers.get("xi-api-key"), expectedKey);
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.headers.get("cookie"), null);
      if (listing) {
        assert.equal(url.pathname, "/v2/voices");
        const expected = new URL("https://api.elevenlabs.io/v2/voices");
        expected.searchParams.set("page_size", "100");
        if (page > 0) expected.searchParams.set("next_page_token", cursor);
        assert.equal(request.url, expected.toString());
        assert.equal(request.headers.get("accept"), "application/json");
      } else {
        assert.equal(request.method, "POST");
        assert.equal(
          request.url,
          "https://api.elevenlabs.io/v1/text-to-speech/voice%2Fid?output_format=mp3_44100_128"
        );
        assert.equal(request.headers.get("accept"), "audio/mpeg");
        assert.equal(request.headers.get("content-type"), "application/json");
        assert.deepEqual(await request.json(), {
          model_id: selection.model_id,
          text: speechText,
        });
      }
      // Count only verified requests so safe SDK failures cannot mask a wire assertion.
      requests.push(request.method);
      if (mode === "throw")
        throw new Error(`${key} ${speechText} upstream-body`);
      if (mode === "401" || mode === "403")
        return new Response(`${key} upstream-body`, {
          status: Number(mode),
          headers: { "content-length": String(32 * 1024 * 1024) },
        });
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
              "content-type": listing ? "application/json" : "audio/mpeg",
              "content-length": String(32 * 1024 * 1024),
            },
          }
        );
      if (listing) {
        if (mode === "malformed")
          return new Response("{", {
            headers: { "content-type": "application/json" },
          });
        if (mode === "defaults")
          return Response.json({
            voices: Array.from({ length: 125 }, (_, i) => ({
              voice_id: `default-${i}`,
              name: `Default ${i}`,
            })),
            has_more: false,
          });
        const first = page++ === 0;
        if (first) key = rotatedKey;
        return Response.json({
          voices: first
            ? [
                { voice_id: " z ", name: " Zulu ", secret: key },
                { voice_id: "a", name: "Alpha", preview_url: key },
              ]
            : [
                { voice_id: "a", name: "Changed name" },
                { voice_id: "b", name: "Alpha", labels: { secret: key } },
              ],
          has_more: first || mode === "repeated_cursor",
          next_page_token: mode === "invalid_cursor" ? "\ud800" : cursor,
          upstream: key,
        });
      }
      return new Response(data, {
        headers: {
          "content-type": mode === "wrong_type" ? "audio/wav" : "audio/mpeg",
          "content-disposition": `attachment; filename="${key}.mp3"`,
          "x-provider-metadata": key,
        },
      });
    },
    download: async () => {
      downloads++;
      throw new Error(
        "Speech and voice listing cannot grant a download destination"
      );
    },
  });
  const client = new TextToSpeechClient({ keys, http });
  const list = (signal) =>
    client.listVoices({ provider: "elevenlabs", signal });
  const failure = (code) => (error) => {
    assert(error instanceof TextToSpeechClient.Failure);
    assert.deepEqual(error.toJSON(), { code, message: code });
    assert.equal(error.cause, undefined);
    const exposed = `${error} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [initialKey, rotatedKey, speechText, "upstream-body"])
      assert(!exposed.includes(value));
    return true;
  };
  await check(
    "speech implementation and credential custody remain private",
    async () => {
      assert.throws(() => require.resolve("@grida/ai/text-to-speech-client"));
      assert.deepEqual(Object.keys(client), []);
      assert.throws(
        () => new TextToSpeechClient({ keys, http, gg: {} }),
        failure("invalid_input")
      );
    }
  );
  const operation = await client.resolve(selection);
  await check(
    "speech preserves text and safely encodes a voice without discovery",
    async () => {
      assert.equal(requests.length, 0);
      assert.equal(operation.model_id, "eleven_v3");
      assert.equal(operation.binding_id, "eleven_v3");
      assert.equal(operation.provider_id, "elevenlabs");
      assert.equal(operation.voice_id, "voice/id");
      assert(Object.isFrozen(operation));
      assert(!JSON.stringify(operation).includes(key));
      const result = await operation.generate({ text: speechText });
      assert.deepEqual(result, { audio: { data, media_type: "audio/mpeg" } });
      assert.equal(result.audio.data.constructor, Uint8Array);
      assert.deepEqual(requests, ["POST"]);
    }
  );
  await check(
    "voice pages keep one key snapshot and project sorted unique IDs/names",
    async () => {
      const beforeKeys = keyReads;
      assert.deepEqual(await list(), [
        { voice_id: "a", name: "Alpha" },
        { voice_id: "b", name: "Alpha" },
        { voice_id: "z", name: "Zulu" },
      ]);
      assert.equal(keyReads, beforeKeys + 1);
      assert.equal(key, rotatedKey);
      expectedKey = rotatedKey;
      page = 0;
      mode = "defaults";
      assert.equal((await list()).length, 125);
      mode = "success";
      await operation.generate({ text: speechText });
    }
  );
  await check(
    "speech rejects unsupported selection and inputs before authority or I/O",
    async () => {
      const before = requests.length;
      const beforeKeys = keyReads;
      for (const [input, code] of [
        [{ ...selection, provider: "gg" }, "invalid_input"],
        [{ ...selection, model_id: "missing" }, "model_unavailable"],
        [{ ...selection, voice_id: ".." }, "invalid_input"],
        [{ ...selection, voice_id: "\ud800" }, "invalid_input"],
      ])
        await assert.rejects(client.resolve(input), failure(code));
      for (const input of [
        { text: " " },
        { text: "🔔".repeat(5001) },
        { text: speechText, voice_settings: {} },
      ])
        await assert.rejects(
          operation.generate(input),
          failure("invalid_input")
        );
      await assert.rejects(
        client.listVoices({ provider: "gg" }),
        failure("invalid_input")
      );
      assert.equal(keyReads, beforeKeys);
      assert.equal(requests.length, before);
    }
  );
  await check(
    "key removal blocks speech and discovery; key-reader exceptions stay safe",
    async () => {
      const before = requests.length;
      key = null;
      for (const run of [
        () => client.resolve(selection),
        () => list(),
        () => operation.generate({ text: speechText }),
      ])
        await assert.rejects(run(), failure("provider_key_required"));
      key = rotatedKey;
      keyMode = "throw";
      try {
        for (const run of [
          () => client.resolve(selection),
          () => list(),
          () => operation.generate({ text: speechText }),
        ])
          await assert.rejects(run(), failure("generation_failed"));
      } finally {
        keyMode = "normal";
      }
      assert.equal(requests.length, before);
    }
  );
  for (const [next, code] of [
    ["401", "provider_access_denied"],
    ["403", "provider_access_denied"],
    ["throw", "generation_failed"],
    ["oversized", "invalid_response"],
  ])
    await check(
      `speech and discovery ${next} failures are safe without retries`,
      async () => {
        mode = next;
        page = 0;
        const before = requests.length;
        try {
          await assert.rejects(list(), failure(code));
          await assert.rejects(
            operation.generate({ text: speechText }),
            failure(code)
          );
        } finally {
          mode = "success";
        }
        assert.equal(requests.length, before + 2);
      }
    );
  await check(
    "malformed voice JSON/cursors and wrong speech MIME are refused",
    async () => {
      mode = "malformed";
      await assert.rejects(list(), failure("invalid_response"));
      page = 0;
      mode = "invalid_cursor";
      const beforeInvalid = requests.length;
      await assert.rejects(list(), failure("invalid_response"));
      assert.equal(requests.length, beforeInvalid + 1);
      page = 0;
      mode = "repeated_cursor";
      const before = requests.length;
      await assert.rejects(list(), failure("invalid_response"));
      assert.equal(requests.length, before + 2);
      mode = "wrong_type";
      await assert.rejects(
        operation.generate({ text: speechText }),
        failure("invalid_response")
      );
      mode = "success";
    }
  );
  await check(
    "aborted voice key lookup cannot later submit a request",
    async () => {
      const controller = new AbortController();
      const pending = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      keyMode = "pending";
      try {
        const checked = assert.rejects(
          list(controller.signal),
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
    "aborted speech cancels a late body without resubmission",
    async () => {
      const controller = new AbortController();
      const pending = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      const beforeCancelled = cancelledBodies;
      mode = "pending";
      try {
        const checked = assert.rejects(
          operation.generate({ text: speechText, signal: controller.signal }),
          failure("aborted")
        );
        await pending;
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
  assert.equal(cancelledBodies, 3);
  return {
    requests: requests.length,
    downloads,
    cancelled_bodies: cancelledBodies,
  };
}
