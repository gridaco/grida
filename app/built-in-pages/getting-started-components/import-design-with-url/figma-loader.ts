import { DesignImporterLoaderResult } from "./o";
import { fetch } from "@design-sdk/figma-remote";
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import { getAccessToken } from "@design-sdk/figma-auth-store";

export async function figmaloader(
  url: string
): Promise<DesignImporterLoaderResult> {
  const f_n_n = parseFileAndNodeId(url);
  const f = f_n_n.file;
  const n = f_n_n.node;

  const access_token = getAccessToken();

  const pack = await fetch.fetchTargetAsReflect({
    file: f,
    node: n,
    auth: {
      accessToken: access_token,
      personalAccessToken: access_token,
    },
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
