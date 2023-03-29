import { designToCode, Result } from "@designto/code";
import { DesignInput } from "@grida/builder-config/input";
import { parseFileAndNodeId } from "@design-sdk/figma-url";
import { fetchTargetAsReflect } from "@design-sdk/figma-remote";
import {
  ImageRepository,
  MainImageRepository,
} from "@design-sdk/asset-repository";
import { RemoteImageRepositories } from "@design-sdk/figma-remote/asset-repository";
import type { FrameworkConfig } from "@grida/builder-config";
import { defaultConfigByFramework } from "@grida/builder-config-preset";
import { Language } from "@grida/builder-platform-types";
import { formatCode } from "dart-style";

type FigmaAccessTokenType = "at" | "pat";

export default async function handler(req, res) {
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
    figma_access_token.startsWith("figd") ? "pat" : "at";

  const { uri, framework } = req.body;
  try {
    const src = await code({
      uri,
      framework,
      auth:
        figma_access_token_type === "at"
          ? {
              accessToken: figma_access_token,
            }
          : {
              personalAccessToken: figma_access_token,
            },
    });

    res.status(200).json({
      src,
    });
  } catch (e) {
    res.status(500).json({
      message: e.message,
      stacktrace: e.stack,
    });

    throw e;
  }
}

async function code({
  auth,
  uri,
  framework,
}: {
  auth:
    | {
        personalAccessToken: string;
      }
    | { accessToken: string };
  uri: string;
  framework: FrameworkConfig;
}) {
  //

  const res = parseFileAndNodeId(uri as string);
  if (res) {
    const { file: filekey, node } = res;

    console.log(`filekey: ${filekey}`, `node: ${node}`);

    //
    const target = await fetchTargetAsReflect({
      file: filekey,
      node,
      auth: auth,
    });

    MainImageRepository.instance = new RemoteImageRepositories(target.file, {
      authentication: auth,
    });
    MainImageRepository.instance.register(
      new ImageRepository(
        "fill-later-assets",
        "grida://assets-reservation/images/"
      )
    );

    const code = await designToCode({
      input: DesignInput.fromApiResponse({
        raw: target.raw,
        entry: target.reflect!,
      }),
      framework: {
        // fill missing configurations.
        ...defaultConfigByFramework(framework.framework),
        ...framework,
      },
      asset_config: { asset_repository: MainImageRepository.instance },
    });

    const src = postproc_src(
      filesrc(code, framework.framework),
      framework.language
    );

    return src;
  }
}

function filesrc(
  code: Result,
  framework: FrameworkConfig["framework"]
): string {
  switch (framework) {
    case "flutter": {
      return code.code.raw;
    }
    default:
      return code.scaffold.raw;
  }
}

function postproc_src(src: string, language: Language) {
  if (language === Language.dart) {
    const { code, error } = formatCode(src);
    if (error) {
      return src;
    }
    return code;
  }

  return src;
}
