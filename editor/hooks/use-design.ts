import { NextRouter, useRouter } from "next/router";
import { useEffect, useState } from "react";
import { DesignProvider, analyzeDesignUrl } from "@design-sdk/url-analysis";
import {
  FigmaTargetNodeConfig,
  parseFileAndNodeId,
} from "@design-sdk/figma-url";
import { fetch } from "@design-sdk/figma-remote";
import { personal } from "@design-sdk/figma-auth-store";
import { configure_auth_credentials } from "@design-sdk/figma-remote";
import { TargetNodeConfig } from "../query/target-node";
import { FigmaRemoteErrors } from "@design-sdk/figma-remote/lib/fetch";
import { RemoteDesignSessionCacheStore } from "../store";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapFigmaRemoteToFigma } from "@design-sdk/figma-remote/lib/mapper";
import { useFigmaAccessToken } from ".";
import { FileResponse } from "@design-sdk/figma-remote-types";

// globally configure auth credentials for interacting with `@design-sdk/figma-remote`
configure_auth_credentials({
  personalAccessToken: personal.get_safe(),
});

/**
 * query param for design input
 */
const P_DESIGN = "design";

type UseDesignProp =
  | (UseDesignFromRouter & UseDesingOptions)
  | (UseDesingFromUrl & UseDesingOptions)
  | (UseDesignFromFileAndNode & UseDesingOptions);

interface UseDesingOptions {
  use_session_cache?: boolean;
}

interface UseDesignFromRouter {
  type: "use-router";
  router?: NextRouter;
}

interface UseDesingFromUrl {
  type: "use-url";
  url: string;
}

interface UseDesignFromFileAndNode {
  type: "use-file-node-id";
  file: string;
  node: string;
}

export function useDesign({
  use_session_cache = false,
  type,
  ...props
}: UseDesignProp) {
  const [design, setDesign] = useState<TargetNodeConfig>(null);
  const figmaAccessToken = useFigmaAccessToken();
  const personalAccessToken = personal.get_safe();
  const router = (type === "use-router" && props["router"]) ?? useRouter();

  useEffect(() => {
    let targetnodeconfig: FigmaTargetNodeConfig;
    switch (type) {
      case "use-file-node-id": {
        if (props["file"] && props["node"]) {
          targetnodeconfig = {
            file: props["file"],
            node: props["node"],
            url: `https://www.figma.com/file/${props["file"]}/${props["node"]}`, // only supports figma for now. improve this line
          };
        }
        break;
      }
      case "use-router": {
        const designparam: string = router.query[P_DESIGN] as string;
        const _r = designparam && analyze(designparam);
        switch (_r) {
          case "figma": {
            targetnodeconfig = parseFileAndNodeId(designparam);
            break;
          }
          case undefined: {
            break;
          }
          default: {
            throw new Error(`unknown design provider: ${_r}`);
            // not supported
          }
        }
        break;
      }
      case "use-url": {
        targetnodeconfig = parseFileAndNodeId((props as UseDesingFromUrl).url);
        break;
      }
    }

    if (targetnodeconfig) {
      // load design from local storage or remote figma

      const cacheStore = new RemoteDesignSessionCacheStore({
        file: targetnodeconfig.file,
        node: targetnodeconfig.node,
      });
      // cache control
      if (use_session_cache && cacheStore.exists) {
        const last_response = cacheStore.get();
        const _1_converted_to_figma = mapFigmaRemoteToFigma(
          last_response.nodes[targetnodeconfig.node]
        );
        const _2_converted_to_reflect = convert.intoReflectNode(
          _1_converted_to_figma
        );
        setDesign(<TargetNodeConfig>{
          ...targetnodeconfig,
          raw: last_response,
          figma: _1_converted_to_figma,
          reflect: _2_converted_to_reflect,
        });
      } else {
        if (figmaAccessToken || personalAccessToken) {
          fetch
            .fetchTargetAsReflect({
              file: targetnodeconfig.file,
              node: targetnodeconfig.node,
              auth: {
                personalAccessToken: personalAccessToken,
                accessToken: figmaAccessToken,
              },
            })
            .then((res) => {
              cacheStore.set(res.raw); // setting cache does not need to be determined by `use_session_cache` option.
              setDesign(<TargetNodeConfig>{
                ...res,
                ...targetnodeconfig,
              });
            })
            .catch((err: FigmaRemoteErrors) => {
              switch (err.type) {
                case "UnauthorizedError": {
                  // unauthorized
                  router.push("/preferences/access-tokens");
                  console.info(`(ignored) error while fetching design`, err);
                  break;
                }
                default:
                  if (figmaAccessToken) {
                    // wait..
                  } else {
                    console.error(`error while fetching design`, err);
                    throw err;
                  }
              }
            });
        } else {
          // wait..
          // throw new Error(
          //   "No valid figma access token provided. cannot read design."
          // );
        }
      }
    }
  }, [router, figmaAccessToken]);
  return design;
}

export function useDesignFile({ file }: { file: string }) {
  const [designfile, setDesignFile] = useState<FileResponse>(null);
  const figmaAccessToken = useFigmaAccessToken();
  const figmaPersonalAccessToken = personal.get_safe();
  useEffect(() => {
    if (file && (figmaAccessToken || figmaPersonalAccessToken)) {
      async function handle() {
        const iterator = fetch.fetchFile({
          file,
          auth: {
            personalAccessToken: figmaPersonalAccessToken,
            accessToken: figmaAccessToken,
          },
        });
        let next: IteratorResult<FileResponse>;
        while ((next = await iterator.next()).done === false) {
          setDesignFile(next.value);
        }
      }
      handle();
    }
  }, [file, figmaAccessToken]);

  return designfile;
}

const analyze = (query: string): "id" | DesignProvider => {
  const _r = analyzeDesignUrl(query);
  if (_r == "unknown") {
    return "id";
  } else {
    return _r;
  }
};
