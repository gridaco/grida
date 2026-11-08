// Synthetic current-offering fixture. Discovery parsing has separate wire-level tests.
import { vi } from "vitest";
import {
  GGDiscoveryStore,
  type GGDiscoverySnapshot,
  type GGOperation,
} from "../gg-discovery";
export function fixtureGGDiscovery(
  entries: {
    id: string;
    kind: "image" | "video" | "music";
    background?: boolean;
    image?: boolean;
  }[]
) {
  const operations: GGOperation[] = entries.flatMap((entry) => {
    const variants =
      entry.kind === "music"
        ? ["generate"]
        : entry.image
          ? ["text", "image"]
          : ["text"];
    return variants.map((variant) => ({
      id: `${entry.kind}.${entry.id.replaceAll("/", ".")}.${variant}`,
      model_id: entry.id,
      kind: entry.kind,
      variant,
      path:
        entry.kind === "image"
          ? "/v1/images/generations"
          : entry.kind === "video"
            ? "/v1/videos"
            : `/v1/endpoints/music.${entry.id.replaceAll("/", ".")}.generate`,
      content_type: "application/json",
      response_mode: entry.kind === "image" ? "synchronous" : "job",
      delivery:
        entry.kind === "image" ? "transient_base64" : "provider_reference",
      input_schema: {
        type: "object",
        required: ["prompt"],
        properties: {
          prompt: { type: "string" },
          n: { type: "integer", minimum: 1, maximum: 4 },
          size: { type: "string" },
          aspect_ratio: { type: "string" },
          seed: { type: "integer" },
          quality: { type: "string" },
          duration: { type: "number" },
          resolution: { type: "string" },
          fps: { type: "integer" },
          ...(variant === "image" ? { image: { type: "string" } } : {}),
          ...(entry.background
            ? { background: { enum: ["auto", "opaque", "transparent"] } }
            : {}),
        },
      },
    }));
  });
  const snapshot: GGDiscoverySnapshot = {
    revision: "synthetic.1",
    expires_at: Number.MAX_SAFE_INTEGER,
    endpoints: [],
    operations,
    models: entries.map((entry) => ({
      id: entry.id,
      label: entry.id,
      kind: entry.kind,
      created: 0,
      owned_by: "fixture",
      interfaces: [
        entry.kind === "image"
          ? "images.generations"
          : entry.kind === "video"
            ? "videos"
            : "endpoints",
      ],
      input_modalities: ["text"],
      output_modalities: [entry.kind === "music" ? "audio" : entry.kind],
      operation_ids: operations
        .filter((op) => op.model_id === entry.id)
        .map((op) => op.id),
      capabilities: {},
      limits: {},
      request_schemas: {},
    })),
  };
  const store = new GGDiscoveryStore({
    fetch: vi.fn<typeof fetch>(async () => {
      throw new Error("fixture never fetches");
    }),
  });
  vi.spyOn(store, "ready").mockResolvedValue(snapshot);
  vi.spyOn(store, "view").mockReturnValue(snapshot);
  return store;
}
export function fixtureGGTripoDiscovery() {
  const models = ["tripo/h3.1", "tripo/p1", "tripo/p2"];
  const endpoints = models.flatMap((model) =>
    ["text", "image", "multiview"].map((variant) => ({
      id: `three-d.${model.replaceAll("/", ".")}.${variant}`,
      model,
      operation: `three-d.${model.replaceAll("/", ".")}.${variant}`,
      kind: "three-d",
      variant,
      input_schema: {},
    }))
  );
  for (const model of ["tripo/rig-v1.0", "tripo/rig-v2.5"])
    endpoints.push({
      id: `three-d.${model.replaceAll("/", ".")}.mesh`,
      model,
      operation: `three-d.${model.replaceAll("/", ".")}.mesh`,
      kind: "three-d",
      variant: "mesh",
      input_schema: {},
    });
  const snapshot: GGDiscoverySnapshot = {
    revision: "synthetic.tripo.1",
    expires_at: Number.MAX_SAFE_INTEGER,
    models: [],
    operations: [],
    endpoints: [
      ...endpoints,
      {
        id: "three-d.tripo.rig-check",
        model: null,
        operation: "three-d.tripo.rig-check",
        kind: "three-d",
        variant: "mesh",
        input_schema: {},
      },
    ],
  };
  const store = new GGDiscoveryStore({
    fetch: vi.fn<typeof fetch>(async () => {
      throw new Error("fixture never fetches");
    }),
  });
  vi.spyOn(store, "ready").mockResolvedValue(snapshot);
  vi.spyOn(store, "view").mockReturnValue(snapshot);
  return store;
}
