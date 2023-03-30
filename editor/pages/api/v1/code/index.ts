import { code } from "@grida/code";
import type { CodeRequest, FigmaToVanillaResponse } from "@grida/api/types";
import { LICENSE_CE } from "@grida/api";
import assert from "assert";
import { FrameworkConfig, VanillaFrameworkConfig } from "@grida/builder-config";

type FigmaAccessTokenType = "fat" | "fpat";

export default async function handler(req, res) {
  try {
    // accept only post request
    if (req.method !== "POST") {
      res.status(405).json({ message: "method not allowed" });
      return;
    }

    const figma_access_token: string = req.headers["x-figma-token"];

    if (!figma_access_token) {
      res.status(401).json({
        message: "No figma access token provided.",
      });
      return;
    }

    const figma_access_token_type: FigmaAccessTokenType =
      figma_access_token.startsWith("figd") ? "fpat" : "fat";

    const { figma, framework } = req.body as CodeRequest;

    assert(typeof figma === "string", "`body.figma` must be a string");

    try {
      const src = await code({
        uri: figma,
        framework: framework as FrameworkConfig,
        auth:
          figma_access_token_type === "fat"
            ? {
                accessToken: figma_access_token,
              }
            : {
                personalAccessToken: figma_access_token,
              },
      });

      const response: FigmaToVanillaResponse = {
        figma: {
          file: {
            name: "",
            lastModified: "",
            thumbnailUrl: "",
            version: "",
          },
          filekey: "",
          entry: "",
          node: undefined,
          json: "",
        },
        framework: framework as VanillaFrameworkConfig,
        src: "",
        srcdoc: "",
        srcmap: null, // TODO:
        files: {
          "index.html": src,
        },
        thumbnail: null, // TODO:
        engine: {
          name: "code.grida.co/api/v1",
          version: "2023.1.1",
          license: "AGPL-3.0",
        },
        version: 0,
        license: LICENSE_CE,
        warnings: [],
      };

      res.status(200).json(response);
    } catch (e) {
      res.status(500).json({
        message: e.message,
        stacktrace: e.stack,
      });

      throw e;
    }
  } catch (e) {
    res.status(500).json({
      message: e.message,
      stacktrace: e.stack,
    });
  }
}
