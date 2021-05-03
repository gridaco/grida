import React, { useEffect, useState } from "react";
import * as FigmaApi from "figma-js";
import { TextField } from "@material-ui/core";
import { utils_figma } from "../../utils";
import { convert } from "@bridged.xyz/design-sdk";
import { mapFigmaRemoteToFigma } from "@bridged.xyz/design-sdk/lib/figma-remote/mapper";
import { ReflectSceneNode } from "@bridged.xyz/design-sdk/lib/nodes";
import { utils } from "@bridged.xyz/design-sdk";
import { UserInputCache } from "../../utils/user-input-value-cache";
import * as figrem from "@bridged.xyz/design-sdk/lib/figma-remote/types";

export type OnImportedCallback = (reflect: ReflectSceneNode) => void;
type _OnRemoteLoadedCallback = (reflect: figrem.Node) => void;

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

  const handleLocalDataLoad = (d: figrem.Node) => {
    console.log("api raw", d);
    const _mapped = mapFigmaRemoteToFigma(d as any);
    console.log("mapped", _mapped);
    const _converted = convert.intoReflectNode(_mapped);
    console.log("converted", _converted);
    setReflect(_converted);
  };

  return (
    <>
      {reflect ? (
        <>
          {reflect.name}{" "}
          <button
            onClick={() => {
              console.log(`using reflect node "${reflect.name}"`, reflect);
              props.onImported(reflect);
            }}
          >
            use loaded node "{reflect.name}"
          </button>
        </>
      ) : (
        <>
          <_DefaultImporterSegment onLoaded={handleLocalDataLoad} />
          <_UrlImporterSegment onLoaded={handleLocalDataLoad} />
        </>
      )}
    </>
  );
}

function _DefaultImporterSegment(props: { onLoaded: _OnRemoteLoadedCallback }) {
  const handleOnLoadDefaultDesignClick = () => {
    fetchDemo().then((d) => {
      // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
      props.onLoaded(d as figrem.Node);
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

const _FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY =
  "_FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY";
function _UrlImporterSegment(props: { onLoaded: _OnRemoteLoadedCallback }) {
  let urlInput: string = UserInputCache.load(
    _FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY
  );

  const handleEnter = () => {
    UserInputCache.set(_FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY, urlInput);
    const q = utils.figmaApi.parseFileAndNodeIdFromUrl_Figma(urlInput);
    fetchTarget(q.file, q.node).then((d) => {
      props.onLoaded(d as figrem.Node);
    });
  };

  return (
    <div>
      <p>you must have access to the target file</p>
      <input
        defaultValue={urlInput}
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
