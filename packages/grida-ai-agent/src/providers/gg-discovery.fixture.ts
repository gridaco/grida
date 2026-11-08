/** Synthetic, anonymous metadata for free hosted-provider contract tests. */
import { GGDiscoveryStore } from "@grida/ai/discovery";
import { ggContractFixture } from "../../../grida-ai/src/testing/gg-contract";
import { catalog } from "@grida/ai/catalogue";

export function ggDiscoveryFixture(
  ids: readonly string[] = Object.keys(catalog.text.catalog)
): GGDiscoveryStore {
  return new GGDiscoveryStore({
    fetch: async (url) => {
      if (String(url).endsWith("operations.json"))
        return Response.json(
          { $defs: {}, "x-gg-operations": [] },
          { headers: { "content-type": "application/schema+json" } }
        );
      return Response.json({
        object: "list",
        revision: "synthetic.1",
        next_change_at: null,
        data: String(url).endsWith("/models")
          ? ids.map((id) => ({
              id,
              object: "model",
              created: 0,
              owned_by: "fixture",
              gg: {
                kind: "text",
                interfaces: ["chat.completions"],
                input_modalities: ["text"],
                output_modalities: ["text"],
                operation_ids: [],
                capabilities: { streaming: true },
                limits: { context_tokens: 8192, max_output_tokens: 1024 },
                request_schemas: {},
                card: { label: id },
              },
            }))
          : [],
      });
    },
  });
}

/** Free media fixture uses the installed SDK class, not a second source-class identity. */
export function ggMediaDiscoveryFixture(
  entries: readonly {
    id: string;
    kind: "image" | "video" | "music";
    background?: boolean;
    image?: boolean;
  }[]
): GGDiscoveryStore {
  const metadata = ggContractFixture(
    entries.map((entry) => ({
      id: entry.id,
      kind: entry.kind,
      background: entry.background ?? false,
      variants:
        entry.kind === "music"
          ? ["generate"]
          : entry.image
            ? ["text", "image"]
            : ["text"],
    }))
  );
  return new GGDiscoveryStore({
    fetch: async (url) => {
      const response = metadata.response(url);
      if (!response) throw new Error("Unexpected synthetic discovery URL");
      return response;
    },
  });
}
