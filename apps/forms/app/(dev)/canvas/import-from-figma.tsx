import { Input } from "@/components/ui/input";
import Figma from "figma-api";
import type { Node } from "@figma/rest-api-spec";
import { grida } from "@/grida";

// async function fetchnode({
//   filekey,
//   id,
//   personalAccessToken,
// }: {
//   filekey: string;
//   id: string;
//   personalAccessToken: string;
// }) {
//   const client = new Figma.Api({ personalAccessToken: personalAccessToken });
//   const result = await client.getFileNodes(
//     { file_key: filekey },
//     { ids: id, geometry: "paths" }
//   );
//   const nodepartialdoc = result.nodes[id];
//   return nodepartialdoc;
// }

export function ImportFromFigma() {
  return (
    <div>
      <Input
        type="url"
        placeholder="https://www.figma.com/design/xxxxxxxxxxxxxxxxxxxxxx/"
      />
    </div>
  );
}
