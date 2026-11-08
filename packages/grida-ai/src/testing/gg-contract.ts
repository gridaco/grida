/** Synthetic public metadata wires for consumer tests; uses the real discovery parser. */
export function ggContractFixture(
  entries: readonly {
    id: string;
    kind: "image" | "video" | "music" | "three-d";
    variants?: readonly string[];
    background?: boolean;
  }[]
) {
  const definitions: Record<string, unknown> = {};
  const operations = entries.flatMap((entry) =>
    (entry.variants ?? [entry.kind === "music" ? "generate" : "text"]).map(
      (variant, index) => {
        const id = `${entry.kind}.${entry.id.replaceAll("/", ".")}.${variant}`;
        const name = `${entry.kind}_${entry.id.replaceAll(/[^A-Za-z0-9]/g, "_")}_${index}`;
        definitions[`${name}_input`] = {
          type: "object",
          required: ["prompt"],
          properties: {
            model: { const: entry.id },
            prompt: { type: "string", minLength: 1, maxLength: 10000 },
            n: { type: "integer", minimum: 1, maximum: 4 },
            size: { type: "string" },
            aspect_ratio: { type: "string" },
            quality: { type: "string" },
            ...(entry.background !== false
              ? { background: { enum: ["auto", "opaque", "transparent"] } }
              : {}),
            duration: { type: "number" },
            resolution: { type: "string" },
            fps: { type: "integer" },
            ...(variant === "image" ? { image: { type: "string" } } : {}),
          },
        };
        const field =
          entry.kind === "image"
            ? "data"
            : entry.kind === "video"
              ? "videos"
              : entry.kind === "music"
                ? "audio"
                : "glb";
        definitions[`${name}_result`] = {
          type: "object",
          required: [field],
          properties: {
            [field]:
              entry.kind === "image" || entry.kind === "video"
                ? {
                    type: "array",
                    items: {
                      type: "object",
                      required: [entry.kind === "image" ? "b64_json" : "url"],
                      properties: {
                        [entry.kind === "image" ? "b64_json" : "url"]: {
                          type: "string",
                        },
                      },
                    },
                  }
                : {
                    type: "object",
                    required: ["url", "media_type"],
                    properties: {
                      url: { type: "string" },
                      media_type: {
                        const:
                          entry.kind === "music"
                            ? "audio/mpeg"
                            : "model/gltf-binary",
                      },
                    },
                  },
          },
        };
        return {
          operation_id: id,
          model_id: entry.id,
          kind: entry.kind,
          variant,
          path:
            entry.kind === "image"
              ? "/v1/images/generations"
              : entry.kind === "video"
                ? "/v1/videos"
                : `/v1/endpoints/${id}`,
          content_type: "application/json",
          request_view: "json",
          response_mode: entry.kind === "image" ? "synchronous" : "job",
          delivery:
            entry.kind === "image" ? "transient_base64" : "provider_reference",
          request_schema: { $ref: `#/$defs/${name}_input` },
          result_schema: { $ref: `#/$defs/${name}_result` },
        };
      }
    )
  );
  const endpoints = operations
    .filter((operation) => operation.path.startsWith("/v1/endpoints/"))
    .map((operation) => ({
      id: operation.operation_id,
      object: "endpoint",
      model: operation.model_id,
      operation: operation.operation_id,
      kind: operation.kind,
      variant: operation.variant,
      input_schema: definitions[operation.request_schema.$ref.slice(8)],
    }));
  const models = entries.map((entry) => ({
    id: entry.id,
    object: "model",
    created: 0,
    owned_by: "fixture",
    gg: {
      kind: entry.kind,
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
        .map((op) => op.operation_id),
      capabilities: {},
      limits: {},
      request_schemas: {},
      card: { label: entry.id },
    },
  }));
  const list = (data: unknown[]) => ({
    object: "list",
    revision: "synthetic.media.1",
    next_change_at: null,
    data,
  });
  const contracts = { $defs: definitions, "x-gg-operations": operations };
  return {
    models: list(models),
    endpoints: list(endpoints),
    contracts,
    response(input: string | URL | Request): Response | undefined {
      const url = String(input);
      if (url === "https://gateway.grida.ai/v1/models")
        return Response.json(list(models));
      if (url === "https://gateway.grida.ai/v1/endpoints")
        return Response.json(list(endpoints));
      if (url === "https://gateway.grida.ai/schemas/operations.json")
        return Response.json(contracts, {
          headers: { "content-type": "application/schema+json" },
        });
      return undefined;
    },
  };
}

/** Installed Tripo adapters have separate upload/mesh wires but current GG offering admission. */
export function ggTripoContractFixture() {
  const metadata = ggContractFixture([
    ...["tripo/h3.1", "tripo/p1", "tripo/p2"].map((id) => ({
      id,
      kind: "three-d" as const,
      variants: ["text", "image", "multiview"],
    })),
    ...["tripo/rig-v1.0", "tripo/rig-v2.5"].map((id) => ({
      id,
      kind: "three-d" as const,
      variants: ["mesh"],
    })),
  ]);
  metadata.endpoints.data.push({
    id: "three-d.tripo.rig-check",
    object: "endpoint",
    model: null,
    operation: "three-d.tripo.rig-check",
    kind: "three-d",
    variant: "mesh",
    input_schema: {},
  });
  return metadata;
}
