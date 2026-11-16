/** Synthetic, anonymous metadata for free hosted-provider contract tests. */
import { GGDiscoveryStore } from "@grida/ai/discovery";
import { ggContractFixture } from "../../../grida-ai/src/testing/gg-contract";

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
