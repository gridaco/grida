import { DesignImporterLoaderResult } from "./o";
import { fetch } from "@design-sdk/figma-remote";
import { parseFileAndNodeId } from "@design-sdk/figma-url";

export async function figmaloader(
  url: string
): Promise<DesignImporterLoaderResult> {
  const f_n_n = parseFileAndNodeId(url);
  const f = f_n_n.file;
  const n = f_n_n.node;

  const personal_acctok = process.env.FIGMA_PERSONAL_ACCESS_TOKEN;

  const pack = await fetch.fetchTargetAsReflect(f, n, {
    personalAccessToken: personal_acctok,
  });
  const { name: n_name, id: n_id } = pack.reflect;

  return {
    name: n_name,
    id: n_id,
    source: "figma",
    url: url,
    node: pack.reflect, // todo
  };
}
