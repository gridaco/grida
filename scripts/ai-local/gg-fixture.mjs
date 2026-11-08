// Synthetic public contracts shared by the installed-package consumer proofs.
import assert from "node:assert/strict";
export function ggDocuments(entries) {
  const definitions = {
    ImageResult: {
      type: "object",
      properties: { data: { type: "array" } },
      required: ["data"],
    },
    VideoResult: {
      type: "object",
      properties: { videos: { type: "array" } },
      required: ["videos"],
    },
    MusicResult: {
      type: "object",
      properties: { audio: { $ref: "#/$defs/AudioReference" } },
      required: ["audio"],
    },
    AudioReference: {
      type: "object",
      properties: {
        url: { type: "string" },
        media_type: { const: "audio/mpeg" },
      },
      required: ["url", "media_type"],
    },
  };
  const operations = entries.map(({ id, kind }) => {
    const operation_id = `${kind}.${id.replaceAll("/", ".")}.${kind === "music" ? "generate" : "text"}`;
    definitions[operation_id] = {
      type: "object",
      properties: {
        model: { const: id },
        prompt: { type: "string" },
        n: { type: "integer" },
        size: { type: "string" },
        aspect_ratio: { type: "string" },
        seed: { type: "integer" },
        duration: { type: "integer" },
      },
      required: kind === "music" ? ["prompt"] : ["model", "prompt"],
    };
    return {
      operation_id,
      model_id: id,
      kind,
      variant: kind === "music" ? "generate" : "text",
      path:
        kind === "image"
          ? "/v1/images/generations"
          : kind === "video"
            ? "/v1/videos"
            : `/v1/endpoints/${operation_id}`,
      content_type: "application/json",
      request_view: "json",
      response_mode: kind === "image" ? "synchronous" : "job",
      delivery: kind === "image" ? "transient_base64" : "provider_reference",
      request_schema: { $ref: `#/$defs/${operation_id}` },
      result_schema: {
        $ref: `#/$defs/${kind === "image" ? "ImageResult" : kind === "video" ? "VideoResult" : "MusicResult"}`,
      },
    };
  });
  const models = entries.map(({ id, kind }) => ({
    id,
    object: "model",
    created: 0,
    owned_by: "fixture",
    gg: {
      kind,
      interfaces: [
        kind === "image"
          ? "images.generations"
          : kind === "video"
            ? "videos"
            : "endpoints",
      ],
      input_modalities: ["text"],
      output_modalities: [kind === "music" ? "audio" : kind],
      operation_ids: operations
        .filter((op) => op.model_id === id)
        .map((op) => op.operation_id),
      capabilities: {},
      limits: {},
      request_schemas: {},
      card: { label: id },
    },
  }));
  const endpoints = operations
    .filter((op) => op.kind === "music")
    .map((op) => ({
      id: op.operation_id,
      model: op.model_id,
      operation: op.operation_id,
      kind: op.kind,
      variant: op.variant,
      input_schema: definitions[op.operation_id],
    }));
  return {
    "/v1/models": {
      object: "list",
      revision: "synthetic.current.1",
      next_change_at: null,
      data: models,
    },
    "/v1/endpoints": {
      object: "list",
      revision: "synthetic.current.1",
      next_change_at: null,
      data: endpoints,
    },
    "/schemas/operations.json": {
      $defs: definitions,
      "x-gg-operations": operations,
    },
  };
}
export async function ggFixture(load, entries) {
  const { GGDiscoveryStore } = await load("@grida/ai/discovery");
  const documents = ggDocuments(entries);
  const store = new GGDiscoveryStore({
    origin: "https://discovery.example.invalid",
    fetch: async (input, init) => {
      assert.equal(new Headers(init.headers).has("authorization"), false);
      assert.equal(new Headers(init.headers).has("cookie"), false);
      assert.equal(init.credentials, "omit");
      assert.equal(init.redirect, "error");
      const path = new URL(input).pathname;
      assert(Object.hasOwn(documents, path));
      return Response.json(documents[path], {
        headers: {
          "content-type": path.endsWith("operations.json")
            ? "application/schema+json"
            : "application/json",
        },
      });
    },
  });
  assert(await store.ready());
  return store;
}
