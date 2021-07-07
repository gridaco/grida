import { LoaderResult } from "./o";
import { api } from "@design-sdk/figma-remote";
import { parseFileAndNodeId } from "@design-sdk/figma-url";

export async function figmaloader(url: string): Promise<LoaderResult> {
  const f_n_n = parseFileAndNodeId(url);
  const f = f_n_n.file;
  const n = f_n_n.node;
  const client = api.Client({});
  const res = await client.fileNodes(f, {
    ids: [n],
  });

  const node = res.data.nodes[0];
  const { name: n_name, id: n_id } = node.document;

  return {
    name: n_name,
    id: n_id,
    source: "figma",
  };
}
