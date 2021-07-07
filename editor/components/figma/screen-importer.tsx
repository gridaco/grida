import React, { useState } from "react";
import { convert, nodes, Figma } from "@design-sdk/figma";
import { types, api, mapper } from "@design-sdk/figma-remote";
import {
  parseFileAndNodeId,
  FigmaTargetNodeConfig,
} from "@design-sdk/figma-url";
import { utils_figma } from "../../utils";
import { UserInputCache } from "../../utils/user-input-value-cache";

export type OnImportedCallback = (reflect: nodes.ReflectSceneNode) => void;
type _OnRemoteLoadedCallback = (reflect: types.Node) => void;

export interface FigmaReflectImportPack {
  remote: api.Node;
  figma: Figma.SceneNode;
  reflect: nodes.ReflectSceneNode;
}

export async function fetchTargetAsReflect(
  file: string,
  node: string
): Promise<FigmaReflectImportPack> {
  const d = await fetchTarget(file, node);
  const _mapped = mapper.mapFigmaRemoteToFigma(d as any);
  const _converted = convert.intoReflectNode(_mapped);
  return {
    remote: d,
    figma: _mapped,
    reflect: _converted,
  };
}

async function fetchTarget(file: string, node: string) {
  const client = api.Client({
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
  const client = api.Client({
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
  onImported: OnImportedCallback;
  onTargetEnter?: (target: FigmaTargetNodeConfig) => void;
}) {
  const [reflect, setReflect] = useState<nodes.ReflectSceneNode>();

  const handleLocalDataLoad = (d: types.Node) => {
    console.log("api raw", d);
    const _mapped = mapper.mapFigmaRemoteToFigma(d as any);
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
          <_UrlImporterSegment
            onLoaded={handleLocalDataLoad}
            onUrlEnter={(url: string) => {
              const nodeconfig = parseFileAndNodeId(url);
              props.onTargetEnter(nodeconfig);
            }}
          />
        </>
      )}
    </>
  );
}

function _DefaultImporterSegment(props: { onLoaded: _OnRemoteLoadedCallback }) {
  const handleOnLoadDefaultDesignClick = () => {
    fetchDemo().then((d) => {
      // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
      props.onLoaded(d as types.Node);
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
function _UrlImporterSegment(props: {
  onLoaded: _OnRemoteLoadedCallback;
  onUrlEnter?: (url: string) => void;
}) {
  const [loadState, setLoadState] = useState<
    "none" | "loading" | "failed" | "complete"
  >("none");

  let urlInput: string = UserInputCache.load(
    _FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY
  );

  const figmaTargetConfig = parseFileAndNodeId(urlInput);

  const handleEnter = () => {
    props.onUrlEnter?.(urlInput);
    UserInputCache.set(_FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY, urlInput);
    setLoadState("loading");
    fetchTarget(figmaTargetConfig.file, figmaTargetConfig.node)
      .then((d) => {
        setLoadState("complete");
        props.onLoaded(d as types.Node);
      })
      .catch((_) => {
        setLoadState("failed");
        console.error(_);
      });
  };

  const makeMessage = () => {
    switch (loadState) {
      case "failed":
        return "failed to fetch the design. check if you have set the personal access token.";
      case "loading":
        return "fetching design...";
      case "none":
        return "Tip: you must have access to the target file";
      case "complete":
        return "fetched";
    }
  };

  return (
    <div>
      <p>{makeMessage()}</p>
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
