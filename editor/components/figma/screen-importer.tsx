import React, { useState } from "react";
import { nodes } from "@design-sdk/figma";
import { types, fetch } from "@design-sdk/figma-remote";
import {
  parseFileAndNodeId,
  FigmaTargetNodeConfig,
} from "@design-sdk/figma-url";
import { UserInputCache } from "../../utils/user-input-value-cache";
import { personal } from "@design-sdk/figma-auth-store";

export type OnImportedCallback = (reflect: nodes.ReflectSceneNode) => void;
type _OnPartiallyLoadedCallback = (pack: fetch.FigmaRemoteImportPack) => void;

export function FigmaScreenImporter(props: {
  onImported: OnImportedCallback;
  onTargetEnter?: (target: FigmaTargetNodeConfig) => void;
}) {
  const [reflect, setReflect] = useState<nodes.ReflectSceneNode>();

  const handleLocalDataLoad = async (partial: fetch.FigmaRemoteImportPack) => {
    const final = await fetch.completePartialPack(partial);
    setReflect(final.reflect);
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

function _DefaultImporterSegment(props: {
  onLoaded: _OnPartiallyLoadedCallback;
}) {
  const handleOnLoadDefaultDesignClick = () => {
    fetch
      .fetchDemo({
        personalAccessToken: personal.get_safe(),
      })
      .then((d) => {
        // it's okay to force cast here. since the typings are the same (following official figma remote api spec)
        props.onLoaded(d);
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
  onLoaded: _OnPartiallyLoadedCallback;
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
    fetch
      .fetchTarget(figmaTargetConfig.file, figmaTargetConfig.node, {
        personalAccessToken: personal.get_safe(),
      })
      .then((d) => {
        setLoadState("complete");
        props.onLoaded(d);
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
