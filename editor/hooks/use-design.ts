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
import { FigmaRemoteErrors } from "@design-sdk/figma-remote";
import { RemoteDesignSessionCacheStore } from "../store";
import { convert } from "@design-sdk/figma-node-conversion";
import { mapper } from "@design-sdk/figma-remote";
import { useFigmaAccessToken } from ".";
import {
  FigmaDesignRepository,
  TFetchFileForApp,
} from "repository/figma-design-repository";

// globally configure auth credentials for interacting with `@design-sdk/figma-remote`
configure_auth_credentials({
  personalAccessToken: personal.get_safe(),
});

/**
 * query param for design input
 */
export const P_DESIGN = "design";

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
  const fat = useFigmaAccessToken();
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
      const filekey = targetnodeconfig.file;
      // load design from local storage or remote figma
      const cacheStore = new RemoteDesignSessionCacheStore({
        file: targetnodeconfig.file,
        node: targetnodeconfig.node,
      });
      // cache control
      if (use_session_cache && cacheStore.exists) {
        const last_response = cacheStore.get();
        const _1_converted_to_figma = mapper.mapFigmaRemoteToFigma(
          last_response.nodes[targetnodeconfig.node]
        );
        const _2_converted_to_reflect = convert.intoReflectNode(
          _1_converted_to_figma,
          null,
          "rest",
          filekey
        );

        const res = <TargetNodeConfig>{
          ...targetnodeconfig,
          raw: last_response,
          figma: _1_converted_to_figma,
          reflect: _2_converted_to_reflect,
        };
        setDesign(res);
      } else {
        if (fat.accessToken || fat.personalAccessToken) {
          fetch
            .fetchTargetAsReflect({
              file: targetnodeconfig.file,
              node: targetnodeconfig.node,
              auth: {
                personalAccessToken: fat.personalAccessToken,
                accessToken: fat.accessToken.token,
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
                  if (fat.accessToken) {
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
  }, [router, fat.accessToken, props["url"]]);
  return design;
}

export type TUseDesignFile =
  | TFetchFileForApp
  | {
      __type: "error";
      reason: "no-auth" | "unauthorized";
      cached?: TFetchFileForApp;
    }
  | { __type: "error"; reason: "no-file" }
  | { __type: "loading" };

export function useDesignFile({ file }: { file: string }) {
  const [designfile, setDesignFile] = useState<TUseDesignFile>({
    __type: "loading",
  });
  const fat = useFigmaAccessToken();
  useEffect(() => {
    if (file) {
      if (fat.personalAccessToken || fat.accessToken.token) {
        async function handle() {
          const repo = new FigmaDesignRepository({
            personalAccessToken: fat.personalAccessToken,
            accessToken: fat.accessToken.token,
          });
          const iterator = repo.fetchFile(file);
          let next: IteratorResult<TFetchFileForApp>;
          while ((next = await iterator.next()).done === false) {
            setDesignFile(next.value);
          }
        }
        handle();
      } else {
        if (fat.accessToken.loading) {
          setDesignFile({
            __type: "loading",
          });
        } else {
          // if no auth provided, try to used cached file if possible.
          FigmaDesignRepository.fetchCachedFile(file)
            .then((r) => {
              setDesignFile({
                __type: "error",
                reason: "no-auth",
                cached: r,
              });
            })
            .catch((e) => {
              setDesignFile({
                __type: "error",
                reason: "no-auth",
              });
            });
        }
      }
    } else {
      setDesignFile({
        __type: "error",
        reason: "no-file",
      });
    }
  }, [file, fat.accessToken.loading]);

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
