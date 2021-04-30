import React from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";
import { convert } from "@bridged.xyz/design-sdk";
import { mapFigmaRemoteToFigma } from "@bridged.xyz/design-sdk/lib/figma-remote/mapper";
import { flutter } from "@designto.codes/core";
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

  const nodes = nodesRes.data.nodes;

  const demoEntryNode = nodes[_nid];

  return demoEntryNode.document;
}

export function FigmaScreenImporter() {
  fetchDemo().then((d) => {
    console.log(d);
    const Frame = d as FigmaApi.Frame;

    // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
    const smi = mapFigmaRemoteToFigma(d as any);
    console.log("smi", smi);
    const cvted = convert.intoReflectNode(smi);
    console.log("cvted", cvted);
    const fltap = flutter.buildApp(cvted);
    console.log("fltap", fltap);
  });
  return <></>;
}
