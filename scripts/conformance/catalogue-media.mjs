// Capture the existing TypeScript public operations against synthetic provider wires.
// No live provider or account is accessed. Rust replays these exact request/response pairs.
import fs from "node:fs";
import { projectRequest } from "./catalogue-request.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const reference = process.argv.includes("--reference");
if (reference) await (await import("./baseline.mjs")).verifyBuild();
const api = require(
  path.join(
    root,
    reference
      ? "target/conformance/reference/packages/grida-ai/dist/index.cjs"
      : "packages/grida-ai/dist/index.cjs"
  )
);
const operations = new api.MediaOperations();
const descriptors = [...operations.list(), ...operations.rigging.list()];
const png = Buffer.from("iVBORw0KGgo=", "base64");
const document = '{"asset":{"version":"2.0"}}';
const jsonBytes = Buffer.from(
  document.padEnd(Math.ceil(document.length / 4) * 4, " ")
);
const glb = Buffer.alloc(20 + jsonBytes.length);
glb.write("glTF");
glb.writeUInt32LE(2, 4);
glb.writeUInt32LE(glb.length, 8);
glb.writeUInt32LE(jsonBytes.length, 12);
glb.writeUInt32LE(0x4e4f534a, 16);
jsonBytes.copy(glb, 20);
const key = "synthetic-key";
const gg = { getAccessToken: () => "synthetic-token" };
const base = "https://gg.example";
const samples = [];
function sample(schema, name = "") {
  if (schema.default !== undefined) return schema.default;
  if (schema.enum)
    return schema.enum.includes("transparent") ? "transparent" : schema.enum[0];
  if (schema.type === "object") {
    const out = {};
    for (const [key, rule] of Object.entries(schema.properties)) {
      if (
        schema.required.includes(key) ||
        [
          "seed",
          "quality",
          "background",
          "size",
          "aspect_ratio",
          "resolution",
          "duration",
          "generate_audio",
          "texture",
          "pbr",
          "face_limit",
          "geometry_quality",
          "loop",
          "prompt_influence",
          "duration_seconds",
        ].includes(key)
      )
        out[key] = sample(rule, key);
    }
    if (schema.anyOf) out.left = sample(schema.properties.left, "left");
    if (schema.oneOf) out.image = sample(schema.properties.image, "image");
    if (schema["x-grida-portable-glb"]) out.data = glb.toString("base64");
    return out;
  }
  if (schema.type === "array") return [sample(schema.items, name)];
  if (schema.type === "boolean") return true;
  if (schema.type === "integer" || schema.type === "number") {
    if (name === "seed") return schema.not?.const === 0 ? 17 : 0;
    return Math.max(schema.minimum ?? 1, (schema.exclusiveMinimum ?? 0) + 1);
  }
  if (schema.contentEncoding === "base64") return png.toString("base64");
  if (schema["x-grida-url"]) return "https://assets.example/image.png";
  if (name === "size" || name === "resolution") return "1024x1024";
  if (name === "aspect_ratio") return "16:9";
  if (name === "voice_id") return "voice-test";
  if (name === "quality") return "medium";
  return " synthetic prompt ";
}
for (const descriptor of descriptors) {
  const selector = {
    kind: descriptor.kind,
    ...(descriptor.model_id ? { model_id: descriptor.model_id } : {}),
    provider: descriptor.provider_id,
    variant: descriptor.variant,
    ...(descriptor.feature ? { feature: descriptor.feature } : {}),
  };
  const input = sample(descriptor.input_schema);
  const transcript = [];
  const handler =
    (lane) =>
    async (url, init = {}) => {
      url = String(url);
      const method = init.method ?? "GET";
      const request = projectRequest(lane, url, init);
      let value;
      let mime = "application/json";
      let bytes;
      const type = descriptor.kind;
      if (lane === "download") {
        bytes =
          type === "image"
            ? png
            : type === "three-d"
              ? glb
              : Buffer.from([1, 2, 3]);
        mime =
          type === "image"
            ? "image/png"
            : type === "three-d"
              ? "model/gltf-binary"
              : "video/mp4";
      } else if (method === "PUT") {
        bytes = Buffer.alloc(0);
      } else if (url.startsWith("https://queue.fal.run/") && method === "POST")
        value = {
          request_id: "job",
          status_url: "https://queue.fal.run/job/status",
          response_url: "https://queue.fal.run/job/result",
        };
      else if (url.endsWith("/job/status")) value = { status: "COMPLETED" };
      else if (url.endsWith("/job/result"))
        value =
          type === "image"
            ? {
                images: [
                  {
                    url: "https://v3.fal.media/result.png",
                    content_type: "image/png",
                  },
                ],
              }
            : type === "video"
              ? {
                  video: {
                    url: "https://v3.fal.media/result.mp4",
                    content_type: "video/mp4",
                  },
                }
              : { model_glb: { url: "https://v3.fal.media/result.glb" } };
      else if (url === "https://openrouter.ai/api/v1/images")
        value = { data: [{ b64_json: png.toString("base64") }] };
      else if (url.endsWith("/image-model"))
        value = { images: [png.toString("base64")] };
      else if (url.endsWith("/video-model")) {
        bytes = Buffer.from(
          `: keepalive\r\n\r\ndata: ${JSON.stringify({ type: "result", videos: [{ type: "base64", data: "AQID", mediaType: "video/mp4" }] })}\r\n\r\n`
        );
        mime = "text/event-stream";
      } else if (url === "https://openrouter.ai/api/v1/videos")
        value = { id: "video-test" };
      else if (url.endsWith("/video-test")) value = { status: "completed" };
      else if (url.endsWith("/content?index=0")) {
        bytes = Buffer.from([1, 2, 3]);
        mime = "video/mp4";
      } else if (url.startsWith("https://api.elevenlabs.io/")) {
        bytes = Buffer.from([1, 2, 3]);
        mime = "audio/mpeg";
      } else if (url.endsWith("/images/generations"))
        value = { images: [{ base64: png.toString("base64") }] };
      else if (url.endsWith("/videos/generations"))
        value = { videos: [{ base64: "AQID", media_type: "video/mp4" }] };
      else if (url.endsWith("/music/generations"))
        value = {
          model_id: descriptor.model_id,
          provider_id: "gg",
          audio: {
            base64: "AQID",
            media_type: "audio/mpeg",
            file_name: "music.mp3",
          },
        };
      else if (url === "https://openapi.tripo3d.ai/v3/files")
        value = { code: 0, data: { file_token: "file_test" } };
      else if (
        url.startsWith("https://openapi.tripo3d.ai/v3/") &&
        method === "POST"
      )
        value = { code: 0, data: { task_id: "task_test" } };
      else if (url === "https://openapi.tripo3d.ai/v3/tasks/task_test")
        value = {
          code: 0,
          data: {
            task_id: "task_test",
            type:
              descriptor.feature === "rig-check"
                ? "rig_check"
                : descriptor.feature === "rigging"
                  ? "rig"
                  : `${descriptor.variant}_to_model`,
            status: "success",
            credits_consumed: 1,
            output:
              descriptor.feature === "rig-check"
                ? { riggable: true, rig_type: "biped" }
                : { model_url: "https://cdn.tripo3d.ai/result.glb" },
          },
        };
      else if (url.endsWith("/3d/uploads"))
        value = {
          upload: "signed-receipt",
          upload_url:
            "https://tripo-data.s3.us-west-2.amazonaws.com/upload.png?signature=synthetic",
        };
      else if (url.includes("/api/v1/ai/3d/"))
        value = {
          provider_id: "gg",
          feature: descriptor.feature,
          ...(descriptor.model_id ? { model_id: descriptor.model_id } : {}),
          ...(descriptor.feature === "model-generation"
            ? { variant: descriptor.variant }
            : {}),
          task: { id: "task_test", credits_consumed: 1 },
          ...(descriptor.feature === "rig-check"
            ? { riggable: true, rig_type: "biped" }
            : {
                glb: {
                  base64: glb.toString("base64"),
                  media_type: "model/gltf-binary",
                },
              }),
        };
      else throw Error(`Unmocked URL: ${url}`);
      bytes ??= Buffer.from(JSON.stringify(value));
      transcript.push({
        request,
        response: {
          status: 200,
          headers: { "content-type": mime },
          base64: bytes.toString("base64"),
        },
      });
      return new Response(bytes, {
        status: 200,
        headers: { "content-type": mime },
      });
    };
  const http = new api.ProviderHttp({
    request: handler("provider"),
    download: handler("download"),
  });
  const options = { keys: { get: () => key }, http, gg, gg_base_url: base };
  let parsed;
  let client;
  if (descriptor.feature === "rigging" || descriptor.feature === "rig-check") {
    const { kind: _, ...selection } = selector;
    parsed = operations.rigging.parseInput(selection, input);
    client = new api.RiggingClient(options);
  } else {
    parsed = operations.parseInput(selector, input);
    client = new api[
      descriptor.kind === "image"
        ? "ImageClient"
        : descriptor.kind === "video"
          ? "VideoClient"
          : descriptor.kind === "music"
            ? "MusicClient"
            : descriptor.kind === "sound-effect"
              ? "SoundEffectClient"
              : descriptor.kind === "text-to-speech"
                ? "TextToSpeechClient"
                : descriptor.provider_id === "fal"
                  ? "ThreeDClient"
                  : "TripoClient"
    ](
      descriptor.kind === "music"
        ? { http, gg, gg_base_url: base }
        : ["sound-effect", "text-to-speech"].includes(descriptor.kind) ||
            (descriptor.kind === "three-d" && descriptor.provider_id === "fal")
          ? { keys: options.keys, http }
          : options
    );
  }
  try {
    const operation = await client.resolve(parsed.selection);
    const result = await (descriptor.feature === "rig-check"
      ? operation.check(parsed.input)
      : operation.generate(parsed.input));
    const encoded = JSON.parse(
      JSON.stringify(result, (_, value) =>
        value instanceof Uint8Array
          ? { base64: Buffer.from(value).toString("base64") }
          : value
      )
    );
    samples.push({
      id: [
        descriptor.kind,
        descriptor.feature,
        descriptor.model_id,
        descriptor.provider_id,
        descriptor.variant,
      ]
        .filter(Boolean)
        .join("/"),
      selector,
      input,
      transcript,
      result: encoded,
    });
  } catch (error) {
    console.error(selector, input, error, transcript);
    throw error;
  }
}
const target = path.join(
  root,
  "crates/grida-ai/tests/fixtures/media-wire-vectors.json"
);
fs.mkdirSync(path.dirname(target), { recursive: true });
const bytes = execFileSync(
  path.join(root, "node_modules/.bin/oxfmt"),
  ["--stdin-filepath", target],
  {
    cwd: root,
    input: JSON.stringify(samples, null, 2) + "\n",
    encoding: "utf8",
  }
);
if (process.argv.includes("--check")) {
  if (fs.readFileSync(target, "utf8") !== bytes)
    throw Error("Media wire fixture drift");
} else fs.writeFileSync(target, bytes);
console.log(`Verified ${samples.length} TypeScript operation wire baselines`);
