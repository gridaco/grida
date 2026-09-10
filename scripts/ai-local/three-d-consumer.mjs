// GRIDA-SEC-004 — exact 3D operations through synthetic queue and asset capabilities.
import assert from "node:assert/strict";

export async function proveThreeD({ load, require, check }) {
  const { ThreeDClient, ProviderHttp } = await load("@grida/ai");
  const textId = "fal-ai/hunyuan-3d/v3.1/pro/text-to-3d";
  const imageId = "fal-ai/hunyuan-3d/v3.1/pro/image-to-3d";
  const trellisId = "fal-ai/trellis-2";
  const statusUrl = "https://queue.fal.run/requests/synthetic/status";
  const resultUrl = "https://queue.fal.run/requests/synthetic";
  const assetUrl = "https://v3.fal.media/synthetic.glb";
  const glb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]);
  const imageData = new Uint8Array([0, 1, 2]);
  const prompt = "A synthetic brass robot";
  const initialKey = "synthetic-3d-key-no-authority";
  const rotatedKey = "synthetic-rotated-3d-key-no-authority";
  let key = initialKey;
  let expectedKey = initialKey;
  let modelId = textId;
  let expectedBody = { prompt };
  let mode = "success";
  let keyMode = "normal";
  let keyReads = 0;
  let cancelledBodies = 0;
  let started;
  let resolvePending;
  const requests = [];
  const downloads = [];
  const keys = {
    get(provider) {
      assert.equal(provider, "fal");
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
      assert.equal(request.headers.get("authorization"), `Key ${expectedKey}`);
      assert.equal(request.headers.get("cookie"), null);
      assert.equal(request.headers.get("content-type"), "application/json");
      if (request.method === "POST") {
        assert.equal(request.url, `https://queue.fal.run/${modelId}`);
        assert.deepEqual(await request.json(), expectedBody);
      } else {
        assert.equal(request.method, "GET");
        assert([statusUrl, resultUrl].includes(request.url));
      }
      // Count only verified wires: safe failures must not conceal assertion failures.
      requests.push(request.method);
      if (request.method === "POST") {
        if (mode === "throw") throw new Error(`${key} ${prompt} upstream-body`);
        if (mode === "pending_submit")
          return new Promise((resolve) => {
            resolvePending = resolve;
            started();
          });
        if (mode === "rotate") key = rotatedKey;
        return Response.json({
          status_url: mode === "bad_queue" ? assetUrl : statusUrl,
          response_url: resultUrl,
        });
      }
      if (request.url === statusUrl)
        return Response.json({
          status: "COMPLETED",
          ...(mode === "failed_status"
            ? { error: `${key} upstream-body` }
            : {}),
        });
      const file = {
        url:
          mode === "bad_asset"
            ? "https://fal.media.attacker.invalid/model.glb"
            : assetUrl,
        file_size:
          mode === "large_hint" ? 64 * 1024 * 1024 + 1 : glb.byteLength,
        file_name: `${key}.glb`,
        content_type: "untrusted/provider-mime",
      };
      return Response.json(
        mode === "fallback"
          ? {
              model_urls: {
                glb: file,
                obj: { url: "https://unused.example.invalid/model.obj" },
              },
            }
          : {
              model_glb: file,
              thumbnail: { url: "https://unused.example.invalid/thumb.png" },
              secret: key,
            }
      );
    },
    download: async (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.url, assetUrl);
      assert.equal(request.method, "GET");
      assert.equal(request.headers.get("authorization"), null);
      assert.equal(request.headers.get("cookie"), null);
      downloads.push(request.url);
      if (mode === "pending_download")
        return new Promise((resolve) => {
          resolvePending = resolve;
          started();
        });
      const data = new Uint8Array(glb);
      if (mode === "bad_glb") data[4] = 3;
      return new Response(data, {
        headers: {
          "content-type": "application/octet-stream",
          "content-disposition": `attachment; filename="${key}.glb"`,
        },
      });
    },
  });
  const client = new ThreeDClient({ keys, http });
  const resolve = () => client.resolve({ model_id: modelId, provider: "fal" });
  const failure = (code) => (error) => {
    assert(error instanceof ThreeDClient.Failure);
    assert.deepEqual(error.toJSON(), { code, message: code });
    assert.equal(error.cause, undefined);
    const exposed = `${error} ${JSON.stringify(error)} ${error.stack}`;
    for (const value of [
      initialKey,
      rotatedKey,
      prompt,
      "upstream-body",
      assetUrl,
      statusUrl,
    ])
      assert(!exposed.includes(value));
    return true;
  };
  const generated = (result) => {
    assert.deepEqual(result, {
      glb: { data: glb, media_type: "model/gltf-binary" },
    });
    assert.equal(result.glb.data.constructor, Uint8Array);
  };
  await check(
    "3D operations keep implementation and credential custody private",
    async () => {
      assert.throws(() => require.resolve("@grida/ai/three-d-client"));
      assert.deepEqual(Object.keys(client), []);
      assert.throws(
        () => new ThreeDClient({ keys, http, gg: {} }),
        failure("invalid_input")
      );
    }
  );
  for (const [id, field] of [
    [textId, "prompt"],
    [imageId, "input_image_url"],
    [trellisId, "image_url"],
  ]) {
    await check(
      `${id} keeps its own input wire and primary GLB result`,
      async () => {
        modelId = id;
        expectedBody = {
          [field]: id === textId ? prompt : "data:image/png;base64,AAEC",
        };
        const before = requests.length;
        const beforeDownloads = downloads.length;
        const operation = await resolve();
        assert.equal(requests.length, before);
        assert.equal(operation.model_id, id);
        assert.equal(operation.binding_id, id);
        assert.equal(operation.provider_id, "fal");
        assert(Object.isFrozen(operation));
        assert(!JSON.stringify(operation).includes(key));
        generated(
          await operation.generate(
            id === textId
              ? { prompt: ` ${prompt} ` }
              : { image: { data: imageData, media_type: "image/png" } }
          )
        );
        assert.deepEqual(requests.slice(before), ["POST", "GET", "GET"]);
        assert.equal(downloads.length, beforeDownloads + 1);
      }
    );
  }
  modelId = textId;
  expectedBody = { prompt };
  const textOperation = await resolve();
  await check(
    "3D rejects unsupported selection, mixed inputs and unimplemented options before authority",
    async () => {
      const before = requests.length;
      const beforeKeys = keyReads;
      await assert.rejects(
        client.resolve({ model_id: "not-catalogued", provider: "fal" }),
        failure("model_unavailable")
      );
      await assert.rejects(
        client.resolve({ model_id: textId, provider: "gg" }),
        failure("invalid_input")
      );
      for (const input of [
        { prompt: " " },
        { prompt: "🧊".repeat(1025) },
        { prompt, image: { data: imageData, media_type: "image/png" } },
        { prompt, seed: 0 },
      ])
        await assert.rejects(
          textOperation.generate(input),
          failure("invalid_input")
        );
      assert.equal(keyReads, beforeKeys);
      const imageOperation = await client.resolve({
        model_id: trellisId,
        provider: "fal",
      });
      const imageKeys = keyReads;
      for (const input of [
        { prompt },
        { image: { data: imageData, media_type: "image/png" }, prompt: " " },
        { image: { data: new Uint8Array(), media_type: "image/png" } },
        {
          image: {
            data: new Uint8Array(8 * 1024 * 1024 + 1),
            media_type: "image/png",
          },
        },
        { image: { data: imageData, media_type: "image/gif" } },
        {
          image: { data: imageData, media_type: "image/png" },
          resolution: "1536",
        },
      ])
        await assert.rejects(
          imageOperation.generate(input),
          failure("invalid_input")
        );
      assert.equal(keyReads, imageKeys);
      assert.equal(requests.length, before);
    }
  );
  await check(
    "3D snapshots input bytes before an asynchronous key lookup",
    async () => {
      modelId = imageId;
      expectedBody = { input_image_url: "data:image/png;base64,AAEC" };
      const operation = await resolve();
      const input = new Uint8Array(imageData);
      const pending = new Promise((resolve) => {
        started = resolve;
      });
      keyMode = "pending";
      try {
        const result = operation.generate({
          image: { data: input, media_type: "image/png" },
        });
        await pending;
        input.fill(255);
        resolvePending(key);
        generated(await result);
      } finally {
        keyMode = "normal";
      }
      modelId = textId;
      expectedBody = { prompt };
    }
  );
  await check(
    "3D pins a key through an accepted job and reads later rotation or removal",
    async () => {
      mode = "rotate";
      generated(await textOperation.generate({ prompt }));
      expectedKey = rotatedKey;
      mode = "fallback";
      generated(await textOperation.generate({ prompt }));
      mode = "success";
      key = null;
      const before = requests.length;
      await assert.rejects(
        textOperation.generate({ prompt }),
        failure("provider_key_required")
      );
      await assert.rejects(resolve(), failure("provider_key_required"));
      assert.equal(requests.length, before);
      key = rotatedKey;
    }
  );
  await check(
    "3D key-reader failures are safe without submission",
    async () => {
      const before = requests.length;
      keyMode = "throw";
      try {
        await assert.rejects(resolve(), failure("generation_failed"));
        await assert.rejects(
          textOperation.generate({ prompt }),
          failure("generation_failed")
        );
      } finally {
        keyMode = "normal";
      }
      assert.equal(requests.length, before);
    }
  );
  for (const [next, code, count, downloadCount] of [
    ["throw", "generation_failed", 1, 0],
    ["failed_status", "generation_failed", 2, 0],
    ["bad_queue", "invalid_response", 1, 0],
    ["bad_asset", "invalid_response", 3, 0],
    ["large_hint", "invalid_response", 3, 0],
    ["bad_glb", "invalid_response", 3, 1],
  ])
    await check(
      `3D ${next} failure is bounded, safe and never resubmitted`,
      async () => {
        const before = requests.length;
        const beforeDownloads = downloads.length;
        mode = next;
        try {
          await assert.rejects(
            textOperation.generate({ prompt }),
            failure(code)
          );
        } finally {
          mode = "success";
        }
        assert.equal(requests.length, before + count);
        assert.equal(
          requests.slice(before).filter((method) => method === "POST").length,
          1
        );
        assert.equal(downloads.length, beforeDownloads + downloadCount);
      }
    );
  await check(
    "3D cancellation during key lookup prevents a late paid submission",
    async () => {
      const controller = new AbortController();
      const pending = new Promise((resolve) => {
        started = resolve;
      });
      const before = requests.length;
      keyMode = "pending";
      try {
        const checked = assert.rejects(
          textOperation.generate({ prompt, signal: controller.signal }),
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
  for (const [next, count, downloadCount] of [
    ["pending_submit", 1, 0],
    ["pending_download", 3, 1],
  ]) {
    await check(
      `3D ${next} cancellation releases a late body without resubmission`,
      async () => {
        const controller = new AbortController();
        const pending = new Promise((resolve) => {
          started = resolve;
        });
        const before = requests.length;
        const beforeDownloads = downloads.length;
        const beforeCancelled = cancelledBodies;
        mode = next;
        try {
          const checked = assert.rejects(
            textOperation.generate({ prompt, signal: controller.signal }),
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
          assert.equal(requests.length, before + count);
          assert.equal(downloads.length, beforeDownloads + downloadCount);
        } finally {
          mode = "success";
        }
      }
    );
  }
  assert.equal(cancelledBodies, 2);
  return {
    requests: requests.length,
    downloads: downloads.length,
    cancelled_bodies: cancelledBodies,
  };
}
