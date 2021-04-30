import React from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";

async function fetchDemo() {
  const client = FigmaApi.Client({
    personalAccessToken: utils_figma.figmaPersonalAccessToken(),
  });

  const nodesRes = await client.fileNodes(
    utils_figma.FIGMA_BRIDGED_DEMO_APP_FILE_ID,
    {
      ids: [utils_figma.FIGMA_BRIDGED_DEMO_APP_ENTRY_NODE_ID],
    }
  );

  const nodes = nodesRes.data.nodes;

  const demoEntryNode = nodes[0];

  return demoEntryNode;
}

export function FigmaScreenImporter() {
  fetchDemo().then((d) => {
    console.log(d);
  });
  return <></>;
}
