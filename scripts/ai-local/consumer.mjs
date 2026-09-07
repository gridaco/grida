// GRIDA-SEC-004 — a standalone host uses only the public SDK and synthetic transport.
// GRIDA-SEC-006 — scoped GG state is opaque, memory-only, and rechecked at use.
// GRIDA-GG: provider — these signature bytes do not prove real provider generation.
import assert from "node:assert/strict";
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { proveVideo } from "./video-consumer.mjs";
import { proveMusic } from "./music-consumer.mjs";
import { proveSoundEffects } from "./sound-effect-consumer.mjs";
import { proveTextToSpeech } from "./text-to-speech-consumer.mjs";

const require = createRequire(import.meta.url);
const format = process.argv[2];
const proof = globalThis.__gridaAiProof;
assert(proof, "The offline runtime guard must be installed");

// Positive controls prove the guard is active before importing the package.
await assert.rejects(fetch("https://example.invalid"));
assert.throws(() =>
  readFileSync(`${process.env.HOME}/synthetic-credentials.json`)
);
assert.throws(() =>
  existsSync(`${process.env.HOME}/synthetic-credentials.json`)
);
assert.throws(() =>
  chmodSync(`${process.env.HOME}/synthetic-credentials.json`, 0o600)
);
assert.throws(() => process.env.AI_GATEWAY_API_KEY);
assert.throws(() => process.env.VERCEL_OIDC_TOKEN);
assert.throws(() => process.env.ELEVENLABS_API_KEY);
assert.deepEqual(proof.counts, { network: 1, state: 3, credentials: 3 });
Object.assign(proof.counts, { network: 0, state: 0, credentials: 0 });

const load = (name) => (format === "cjs" ? require(name) : import(name));
const {
  ImageClient,
  ProviderHttp,
  GridaGatewaySessionStore,
  ModelCatalogStore,
} = await load("@grida/ai");
const providers = await load("@grida/ai/providers");
const { models } = await load("@grida/ai-models");
const cases = [];
async function check(name, run) {
  try {
    await run();
    cases.push(name);
  } catch {
    throw new Error(`Public AI consumer case failed: ${name}`);
  }
}
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const base64 = "iVBORw0KGgo=";
const key = "synthetic-provider-key-no-authority";
const scopedToken = "synthetic-scoped-gg-token-no-authority";
const model = "openai/gpt-image-2";
const requests = [];
const downloads = [];
let failing = false;
const http = new ProviderHttp({
  request: async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const authorization = request.headers.get("authorization");
    const body = request.method === "POST" ? await request.json() : undefined;
    requests.push({ url: request.url, method: request.method });
    if (failing)
      throw new Error(
        `${key} ${scopedToken} synthetic-private-prompt upstream-body`
      );
    if (request.method === "POST")
      assert.equal(body.prompt, "A synthetic image");
    if (url.origin === "https://openrouter.ai") {
      assert.equal(url.pathname, "/api/v1/images");
      assert.equal(authorization, `Bearer ${key}`);
      return Response.json({ data: [{ b64_json: base64 }] });
    }
    if (url.origin === "https://ai-gateway.vercel.sh") {
      assert(url.pathname.endsWith("/image-model"));
      assert.equal(authorization, `Bearer ${key}`);
      return Response.json({ images: [base64], warnings: [] });
    }
    if (url.origin === "https://queue.fal.run") {
      assert.equal(authorization, `Key ${key}`);
      if (url.pathname === "/job/status")
        return Response.json({ status: "COMPLETED" });
      if (url.pathname === "/job/result")
        return Response.json({
          images: [
            {
              url: "https://v3.fal.media/image.png",
              content_type: "image/png",
            },
          ],
        });
      assert.equal(
        url.pathname,
        `/${models.image.models[model].providers.fal.id}`
      );
      return Response.json({
        request_id: "job",
        status_url: "https://queue.fal.run/job/status",
        response_url: "https://queue.fal.run/job/result",
      });
    }
    assert.equal(url.origin, "https://gg.example.invalid");
    assert.equal(url.pathname, "/api/v1/ai/images/generations");
    assert.equal(authorization, `Bearer ${scopedToken}`);
    return Response.json({ images: [{ base64, media_type: "image/png" }] });
  },
  download: async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, "https://v3.fal.media/image.png");
    assert.equal(request.headers.get("authorization"), null);
    assert.equal(request.headers.get("cookie"), null);
    downloads.push(request.url);
    return new Response(png, { headers: { "content-type": "image/png" } });
  },
});
const gg = new GridaGatewaySessionStore();
gg.set({
  access_token: scopedToken,
  expires_at: Date.now() + 120_000,
  organization: { id: 7, name: "synthetic" },
});
const client = new ImageClient({
  keys: { get: () => key },
  http,
  gg,
  gg_base_url: "https://gg.example.invalid",
});
const generated = (result) => {
  assert.deepEqual(Object.keys(result), ["images"]);
  assert.equal(result.images.length, 1);
  assert.deepEqual(Object.keys(result.images[0]).sort(), [
    "data",
    "media_type",
  ]);
  assert.deepEqual(result.images[0].data, png);
  assert.equal(result.images[0].media_type, "image/png");
};
const safeFailure = (error) => {
  assert(error instanceof ImageClient.Failure);
  assert.equal(error.cause, undefined);
  const text = `${String(error)} ${JSON.stringify(error)} ${error.stack}`;
  for (const value of [
    key,
    scopedToken,
    "synthetic-private-prompt",
    "upstream-body",
  ])
    assert(!text.includes(value));
  assert.deepEqual(Object.keys(error.toJSON()).sort(), ["code", "message"]);
  return true;
};

await check("host packages and private SDK adapters unavailable", async () => {
  for (const name of [
    "@grida/agent",
    "@grida/daemon",
    "@grida/auth",
    "@grida/account",
    "grida",
    "electron",
    "next",
    "react",
    "hono",
    "drizzle-orm",
  ]) {
    assert.throws(() => require.resolve(name));
  }
  assert.throws(() => require.resolve("@grida/ai/image-byok"));
  assert(
    providers
      .byokProvidersFor("image")
      .some((provider) => provider.id === "fal")
  );
  assert.equal(typeof new ModelCatalogStore().view, "function");
  assert.equal(requests.length, 0);
});
for (const provider of ["openrouter", "vercel", "fal", "gg"]) {
  await check(`${provider} through explicit transport`, async () => {
    const before = requests.length;
    const operation = await client.resolve({ model_id: model, provider });
    assert.equal(requests.length, before);
    assert.equal(operation.provider_id, provider);
    assert.equal(operation.model_id, model);
    assert(!JSON.stringify(operation).includes(key));
    generated(
      await operation.generate({
        prompt: "A synthetic image",
        size: "1024x1024",
      })
    );
  });
}
await check(
  "reference capability is available before input resolution",
  async () => {
    const before = requests.length;
    const operation = await client.resolve({
      model_id: model,
      provider: "openrouter",
      references: true,
    });
    assert.equal(operation.references_max, 16);
    assert.equal(requests.length, before);
    generated(
      await operation.generate({
        prompt: "A synthetic image",
        references: [`data:image/png;base64,${base64}`],
      })
    );
  }
);
await check("unsupported model and missing key refuse before I/O", async () => {
  const before = requests.length;
  await assert.rejects(
    client.resolve({ model_id: "synthetic-missing-model", provider: "fal" }),
    safeFailure
  );
  const empty = new ImageClient({ http, keys: { get: () => null } });
  await assert.rejects(
    empty.resolve({ model_id: model, provider: "vercel" }),
    safeFailure
  );
  assert.equal(requests.length, before);
});
await check("selected key loss cannot silently switch provider", async () => {
  let available = true;
  const selected = new ImageClient({
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
    operation.generate({ prompt: "A synthetic image" }),
    safeFailure
  );
  assert.equal(requests.length, before);
});
await check(
  "failed generation submits once and exposes only safe failure",
  async () => {
    const operation = await client.resolve({
      model_id: model,
      provider: "vercel",
    });
    const before = requests.length;
    failing = true;
    try {
      await assert.rejects(
        operation.generate({ prompt: "A synthetic image" }),
        safeFailure
      );
    } finally {
      failing = false;
    }
    assert.equal(requests.length, before + 1);
  }
);
await check(
  "GG status is safe and cleared authority blocks reuse",
  async () => {
    const operation = await client.resolve({ model_id: model, provider: "gg" });
    assert(gg.status().active);
    assert(!JSON.stringify(gg.status()).includes(scopedToken));
    gg.clear();
    const before = requests.length;
    await assert.rejects(
      operation.generate({ prompt: "A synthetic image" }),
      safeFailure
    );
    await assert.rejects(
      client.resolve({ model_id: model, provider: "gg" }),
      safeFailure
    );
    assert.equal(requests.length, before);
    assert.equal(gg.status().active, false);
  }
);
const video = await proveVideo({ load, require, check });
const music = await proveMusic({ load, require, check });
const sound_effects = await proveSoundEffects({ load, require, check });
const text_to_speech = await proveTextToSpeech({ load, require, check });
await check(
  "no ambient network, credential discovery or filesystem state",
  async () => {
    assert.deepEqual(proof.counts, { network: 0, state: 0, credentials: 0 });
    assert.equal(downloads.length, 1);
    assert(
      [...proof.loaded].some(
        (filename) => filename.includes("@vercel") && filename.includes("oidc")
      ),
      "Use the real Node dependency branch"
    );
  }
);
process.stdout.write(
  JSON.stringify({
    cases,
    requests: requests.length,
    downloads: downloads.length,
    video,
    music,
    sound_effects,
    text_to_speech,
    guard: proof.counts,
    loaded_modules: proof.loaded.size,
  })
);
