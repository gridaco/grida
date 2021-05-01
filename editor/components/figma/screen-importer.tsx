import React, { useEffect, useState } from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";
import { convert } from "@bridged.xyz/design-sdk";
import { mapFigmaRemoteToFigma } from "@bridged.xyz/design-sdk/lib/figma-remote/mapper";
import { ReflectSceneNode } from "@bridged.xyz/design-sdk/lib/nodes";
import { utils } from "@bridged.xyz/design-sdk";

export type OnImportedCallback = (reflect: ReflectSceneNode) => void;

async function fetchTarget(file: string, node: string) {
  const client = FigmaApi.Client({
    personalAccessToken: utils_figma.figmaPersonalAccessToken(),
  });

  const nodesRes = await client.fileNodes(file, {
    ids: [node],
  });
  const nodes = nodesRes.data.nodes;

  const demoEntryNode = nodes[node];

  return demoEntryNode.document;
}

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

export function FigmaScreenImporter(props: { onImported: OnImportedCallback }) {
  const [reflect, setReflect] = useState<ReflectSceneNode>();

  const handleLocalDataLoad = (d: ReflectSceneNode) => {
    setReflect(d);
  };

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
            use loaded node "{reflect.name}"
          </button>
        </>
      ) : (
        <>
          <_DefaultImporterSegment onImported={handleLocalDataLoad} />
          <_UrlImporterSegment onImported={handleLocalDataLoad} />
        </>
      )}
    </>
  );
}

function _DefaultImporterSegment(props: { onImported: OnImportedCallback }) {
  const handleOnLoadDefaultDesignClick = () => {
    fetchDemo().then((d) => {
      // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
      const smi = mapFigmaRemoteToFigma(d as any);
      const cvted = convert.intoReflectNode(smi);
      props.onImported(cvted);
    });
  };

  return (
    <button
      onClick={() => {
        handleOnLoadDefaultDesignClick();
      }}
    >
      Load default design
    </button>
  );
}

function _UrlImporterSegment(props: { onImported: OnImportedCallback }) {
  const handleEnter = () => {
    const q = utils.figmaApi.parseFileAndNodeIdFromUrl_Figma(urlInput);
    fetchTarget(q.file, q.node).then((d) => {
      const smi = mapFigmaRemoteToFigma(d as any);
      const cvted = convert.intoReflectNode(smi);
      props.onImported(cvted);
    });
  };

  let urlInput: string;
  return (
    <div>
      <p>you must have access to the target file</p>
      <input
        onChange={(e) => {
          urlInput = e.target.value;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            handleEnter();
          }
        }}
      />
    </div>
  );
}
