import React, { useState } from "react";
import { remote, utils, nodes } from "@design-sdk/figma";
import { convert } from "@design-sdk/figma";
import { utils_figma } from "../../utils";
import { UserInputCache } from "../../utils/user-input-value-cache";

export type OnImportedCallback = (reflect: nodes.ReflectSceneNode) => void;
type _OnRemoteLoadedCallback = (reflect: remote.types.Node) => void;

async function fetchTarget(file: string, node: string) {
  const client = remote.api.Client({
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
  const client = remote.api.Client({
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
  onUrlEnter?: (url: string) => void;
}) {
  const [reflect, setReflect] = useState<nodes.ReflectSceneNode>();

  const handleLocalDataLoad = (d: remote.types.Node) => {
    console.log("api raw", d);
    const _mapped = remote.mapper.mapFigmaRemoteToFigma(d as any);
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
            onUrlEnter={props.onUrlEnter}
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
      props.onLoaded(d as remote.types.Node);
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
  let urlInput: string = UserInputCache.load(
    _FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY
  );

  const handleEnter = () => {
    props.onUrlEnter?.(urlInput);
    UserInputCache.set(_FIGMA_FILE_URL_IMPORT_INPUT_CACHE_KEY, urlInput);
    const q = utils.figmaApi.parseFileAndNodeIdFromUrl_Figma(urlInput);
    fetchTarget(q.file, q.node).then((d) => {
      props.onLoaded(d as remote.types.Node);
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
