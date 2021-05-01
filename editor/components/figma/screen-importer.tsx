import React, { useEffect, useState } from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";
import { convert } from "@bridged.xyz/design-sdk";
import { mapFigmaRemoteToFigma } from "@bridged.xyz/design-sdk/lib/figma-remote/mapper";
import { flutter } from "@designto.codes/core";
import { ReflectSceneNode } from "@bridged.xyz/design-sdk/lib/nodes";
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

export function FigmaScreenImporter(props: {
  onImported: (reflect: ReflectSceneNode) => void;
}) {
  const [reflect, setReflect] = useState<ReflectSceneNode>();

  useEffect(() => {
    fetchDemo().then((d) => {
      // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
      const smi = mapFigmaRemoteToFigma(d as any);
      const cvted = convert.intoReflectNode(smi);
      setReflect(cvted);
    });
  }, []);
  return (
    <>
      {reflect ? (
        <>
          {reflect.name}{" "}
          <button
            onClick={() => {
              props.onImported(reflect);
            }}
          >
            use this
          </button>
        </>
      ) : (
        <>NO DESIGN LOADED</>
      )}
    </>
  );
}
