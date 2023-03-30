import { code } from "@grida/code";
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
