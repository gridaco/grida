// Fault injection over reviewed provider transcripts: error codes, receipts and no replay.
import fs from "node:fs";
import { parseArgs } from "node:util";
const { values } = parseArgs({
  options: { check: { type: "boolean", default: false } },
});
import assert from "node:assert/strict";
import { expectedFaultRequest, projectRequest } from "./catalogue-request.mjs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const repository = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const api = require(path.join(repository, "packages/grida-ai/dist/index.cjs"));
const operations = new api.MediaOperations();
const wires = JSON.parse(
  fs.readFileSync(
    path.join(
      repository,
      "crates/grida-ai/tests/fixtures/media-wire-vectors.json"
    ),
    "utf8"
  )
);
const vectors = [];
for (const wire of wires) {
  const scenarios = [
    ...[401, 403, 429, 500].map((status) => ({ step: 0, status })),
    { step: 0, throw: true },
    { step: 0, cancel: true },
  ];
  for (const [step, entry] of wire.transcript.entries()) {
    if (entry.response.headers["content-type"] === "application/json") {
      scenarios.push({ step, malformed: true });
      let response;
      try {
        response = JSON.parse(
          Buffer.from(entry.response.base64, "base64").toString()
        );
      } catch {
        continue;
      }
      if (response.status_url)
        for (const url of [
          "https://attacker.example/status",
          "https://sub.queue.fal.run/status",
        ])
          scenarios.push({ step, body_json: { ...response, status_url: url } });
      if (response.response_url)
        scenarios.push({
          step,
          body_json: {
            ...response,
            response_url: "https://attacker.example/result",
          },
        });
      if (
        wire.selector.kind === "three-d" &&
        wire.selector.provider === "fal" &&
        response.model_glb
      )
        for (const size of [-1, 1.5, null, "12"])
          scenarios.push({
            step,
            body_json: {
              ...response,
              model_glb: { ...response.model_glb, file_size: size },
            },
          });
      if (
        wire.selector.kind === "three-d" &&
        wire.selector.provider === "gg" &&
        response.task
      )
        for (const completed of [
          { id: "task_one", credits_consumed: 2 },
          { id: "task_other", credits_consumed: 2 },
          { id: "task_one", credits_consumed: -1 },
        ])
          scenarios.push({
            step,
            status: 500,
            body_json: {
              error: {
                code: "invalid_response",
                task_id: "task_one",
                completed_task: completed,
              },
            },
          });
    }
    if (entry.response.headers["content-type"] === "text/event-stream") {
      for (const text of [
        "data: not-json\n\n",
        "data:\n\n",
        "data: {}\n",
        'data: {"type":"other"}\n\n',
        'data: {"type":"result","videos":[{"type":"base64","data":"AQ=="}]}\n\n',
        'data: {"type":"result","videos":[]}\n\n',
      ])
        scenarios.push({ step, body_text: text });
    }
    if (entry.request.lane === "download")
      scenarios.push({ step, throw: true }, { step, cancel: true });
  }
  for (const fault of scenarios) {
    let calls = 0;
    const abort = new AbortController();
    let wireFailure;
    const send =
      (lane) =>
      async (url, init = {}) => {
        const current = calls++;
        const step = wire.transcript[current];
        try {
          assert(step, "unexpected extra request");
          assert.deepEqual(
            projectRequest(lane, url, init),
            expectedFaultRequest(wire.transcript, fault, current)
          );
        } catch (error) {
          // Provider adapters sanitize transport errors. Preserve assertion
          // failures outside their catch boundary so a bad wire cannot be
          // mistaken for the expected provider/transport failure.
          wireFailure ??= error;
          throw error;
        }
        const response = step.response;
        if (current === fault.step && fault.cancel) abort.abort();
        if (current === fault.step && fault.throw)
          throw Error("synthetic-private-provider-response-and-secret-key");
        return new Response(
          current === fault.step && fault.body_text !== undefined
            ? fault.body_text
            : current === fault.step && fault.body_json
              ? JSON.stringify(fault.body_json)
              : current === fault.step && fault.malformed
                ? "not-json"
                : Buffer.from(response.base64, "base64"),
          {
            status:
              current === fault.step && fault.status
                ? fault.status
                : response.status,
            headers: response.headers,
          }
        );
      };
    const http = new api.ProviderHttp({
      request: send("provider"),
      download: send("download"),
    });
    const keys = { get: () => "synthetic-key" };
    const options = {
      keys,
      http,
      gg: { getAccessToken: () => "synthetic-token" },
      gg_base_url: "https://gg.example",
    };
    const selector = wire.selector;
    const rig = ["rig-check", "rigging"].includes(selector.feature);
    let parsed, client;
    if (rig) {
      const { kind: _, ...selected } = selector;
      parsed = operations.rigging.parseInput(selected, wire.input);
      client = new api.RiggingClient(options);
    } else {
      parsed = operations.parseInput(selector, wire.input);
      const name =
        selector.kind === "image"
          ? "ImageClient"
          : selector.kind === "video"
            ? "VideoClient"
            : selector.kind === "music"
              ? "MusicClient"
              : selector.kind === "sound-effect"
                ? "SoundEffectClient"
                : selector.kind === "text-to-speech"
                  ? "TextToSpeechClient"
                  : selector.provider === "fal"
                    ? "ThreeDClient"
                    : "TripoClient";
      client = new api[name](
        selector.kind === "music"
          ? { http, gg: options.gg, gg_base_url: options.gg_base_url }
          : ["sound-effect", "text-to-speech"].includes(selector.kind) ||
              (selector.kind === "three-d" && selector.provider === "fal")
            ? { keys, http }
            : options
      );
    }
    let expected;
    try {
      const op = await client.resolve(parsed.selection);
      await (rig && selector.feature === "rig-check"
        ? op.check({ ...parsed.input, signal: abort.signal })
        : op.generate({ ...parsed.input, signal: abort.signal }));
      expected = { ok: true };
    } catch (e) {
      expected = JSON.parse(JSON.stringify(e));
    }
    if (wireFailure) throw wireFailure;
    vectors.push({
      id: wire.id + ":" + JSON.stringify(fault),
      operation_id: wire.id,
      fault,
      calls,
      expected,
    });
  }
}
const file = path.join(
  repository,
  "crates/grida-ai/tests/fixtures/error-vectors.jsonl"
);
const text = vectors.map((v) => JSON.stringify(v)).join("\n") + "\n";
if (values.check) {
  if (fs.readFileSync(file, "utf8") !== text)
    throw Error("Error fixture drift");
} else fs.writeFileSync(file, text);
console.log(`Verified ${vectors.length} provider fault contracts`);
