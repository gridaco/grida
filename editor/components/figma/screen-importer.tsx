import React from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";
// import { convert } from "@bridged.xyz/design-sdk";

async function fetchDemo() {
  const _nid = utils_figma.FIGMA_BRIDGED_DEMO_APP_ENTRY_NODE_ID;
  const client = FigmaApi.Client({
    personalAccessToken: utils_figma.figmaPersonalAccessToken(),
  });

  const nodesRes = await client.fileNodes(
    utils_figma.FIGMA_BRIDGED_DEMO_APP_FILE_ID,
    {
      ids: [_nid],
    }
  );

  console.log("nodesRes.data", nodesRes.data);

  const nodes = nodesRes.data.nodes;
  console.log("nodes", nodes);

  const demoEntryNode = nodes[_nid];

  return demoEntryNode.document;
}

export function FigmaScreenImporter() {
  fetchDemo().then((d) => {
    console.log(d);
    // const cvted = convert.intoReflectNode(d as any);
    // console.log("cvted", cvted);
  });
  return <></>;
}
