import type { NextRouter } from "next/router";
import type { TFetchFileForApp } from "@editor/figma-file";

export type UseFigmaInput =
  | (UseFigmaFromRouter & UseFigmaOptions)
  | (UseFimgaFromUrl & UseFigmaOptions)
  | (UseFigmaFromFileNodeKey & UseFigmaOptions);

export interface UseFigmaOptions {
  use_session_cache?: boolean;
}

export interface UseFigmaFromRouter {
  type: "use-router";
  router?: NextRouter;
}

export interface UseFimgaFromUrl {
  type: "use-url";
  url: string;
}

export interface UseFigmaFromFileNodeKey {
  type: "use-file-node-id";
  file: string;
  node: string;
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
